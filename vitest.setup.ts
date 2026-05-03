// Variables d'env minimales pour que les modules s'instancient pendant les tests.
// Aucun appel réseau réel : on n'utilise que les fonctions pures (parseArticleResponse, calculateCost).
process.env.OPENAI_API_KEY ||= 'sk-test-key-for-vitest';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
