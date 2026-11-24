// Client GraphQL Admin minimal : 1 nouvelle tentative en cas d'échec, token jamais journalisé.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ store, token, apiVersion, baseUrl, log }) {
  if (!store) throw new Error('SHOPIFY_STORE manquant');
  if (!token) throw new Error('SHOPIFY_ADMIN_TOKEN manquant (variable d\'environnement)');
  const endpoint = `${baseUrl || `https://${store}`}/admin/api/${apiVersion}/graphql.json`;

  async function once(query, variables) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    if (json.errors?.length) {
      const throttled = json.errors.some((e) => e.extensions?.code === 'THROTTLED');
      const err = new Error('GraphQL : ' + json.errors.map((e) => e.message).join(' | '));
      err.throttled = throttled;
      throw err;
    }
    return json.data;
  }

  // Exécute, réessaie une fois (après pause) puis remonte l'erreur à l'appelant.
  async function gql(query, variables = {}, { userErrorsPath } = {}) {
    const name = (query.match(/(?:query|mutation)\s+(\w+)/) || [])[1] || 'anonyme';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await once(query, variables);
        if (userErrorsPath) {
          const ue = userErrorsPath.split('.').reduce((o, k) => o?.[k], data) || [];
          if (ue.length) throw Object.assign(new Error(`${name} userErrors : ${JSON.stringify(ue)}`), { userErrors: ue });
        }
        return data;
      } catch (e) {
        if (attempt === 2) throw e;
        log(`  ↻ ${name} a échoué (${e.message.slice(0, 200)}), nouvelle tentative…`);
        await sleep(e.throttled ? 4000 : 1500);
      }
    }
  }
  return { gql, endpoint: endpoint.replace(/\/\/[^/]+/, '//' + store) };
}

// Téléverse un fichier local via stagedUploadsCreate et renvoie l'URL de ressource.
export async function stagedUpload(gql, { filename, mimeType, buffer, resource = 'IMAGE' }) {
  const data = await gql(
    `mutation StagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input: [{ resource, filename, mimeType, httpMethod: 'POST', fileSize: String(buffer.length) }] },
    { userErrorsPath: 'stagedUploadsCreate.userErrors' },
  );
  const t = data.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(t.url, { method: 'POST', body: form });
    if (res.ok || res.status === 201 || res.status === 204) return t.resourceUrl;
    lastErr = new Error(`Téléversement ${filename} : HTTP ${res.status}`);
  }
  throw lastErr;
}
