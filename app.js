document.addEventListener('DOMContentLoaded', () => {
    const tacheInput = document.getElementById('tache');
    const sauvegardeBtn = document.getElementById('sauvegarde');
    const resultP = document.getElementById('result');

    sauvegardeBtn.addEventListener('click', () => {
        const tache = tacheInput.value;
        if (tache) {
            localStorage.setItem('tacheQuotidienne', tache);
            resultP.textContent = `Tâche enregistrée : ${tache}`;
            tacheInput.value = '';
        } else {
            resultP.textContent = 'Veuillez entrer une tâche.';
        }
    });

    // Load saved tache
    const savedTache = localStorage.getItem('tacheQuotidienne');
    if (savedTache) {
        resultP.textContent = `Tâche précédente : ${savedTache}`;
    }
});