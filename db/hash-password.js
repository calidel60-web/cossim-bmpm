// Utilitaire : génère le hash bcrypt d'un mot de passe pour l'insérer
// manuellement dans la table `personnel` (colonne password_hash).
//
// Usage :
//   node db/hash-password.js "monMotDePasse"
//
// Nécessite le paquet "bcryptjs" (déjà listé dans package.json).

const bcrypt = require("bcryptjs");

const pwd = process.argv[2];
if (!pwd) {
  console.error('Usage: node db/hash-password.js "monMotDePasse"');
  process.exit(1);
}

const hash = bcrypt.hashSync(pwd, 10);
console.log(hash);
