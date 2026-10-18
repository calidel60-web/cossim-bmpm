# CO — Centre Opérationnel BSPP (déploiement Vercel)

Centre Opérationnel (anciennement CO) pour la Brigade de Sapeurs-Pompiers de Paris : gestion des
interventions, engagement de moyens, synoptique des engins, planning/feuille
de garde et gestion du personnel — sur **Vercel + Neon (Postgres)**.

## Ce qui a changé par rapport à la version Netlify

Le plan gratuit ("Hobby") de Vercel limite à **12 fonctions serverless par
déploiement**. Le projet en comptait 15. Pour tenir sous cette limite (avec
de la marge pour la suite), plusieurs anciennes fonctions ont été
**fusionnées** :

| Ancien fichier (Netlify)                                                                  | Nouveau fichier (Vercel) |
|---------------------------------------------------------------------------------------------|---------------------------|
| `grades.js`, `services.js`, `fonctions.js`, `motifs.js`, `rues.js`, `statut-couleurs.js`    | `api/reference.js` (routé par `?type=`) |
| `intervention-engins.js`, `intervention-services.js`, `intervention-messages.js`             | `api/intervention-sub.js` (routé par `?resource=`) |
| `planning.js`, `planning-engins.js`                                                          | `api/planning.js` (routé par `?resource=`) |
| `auth.js`, `interventions.js`, `engins.js`, `personnel.js`                                   | inchangés (juste reformatés pour Vercel) |
| `_lib.js`                                                                                    | `api/_lib.js` (le préfixe `_` empêche Vercel de le compter comme une fonction) |

**Le front-end (`index.html`) n'a pas eu besoin d'être modifié** : il continue
d'appeler les mêmes URLs qu'avant (`/api/grades`, `/api/motifs`,
`/api/intervention-engins`, `/api/planning-engins`, etc.). C'est le fichier
`vercel.json` qui redirige silencieusement ces anciennes URLs vers les
nouvelles fonctions fusionnées (avec le bon `?type=` / `?resource=`).

Résultat : **7 fonctions serverless** au total, largement sous la limite de
12 — il reste de la marge pour ajouter des fonctionnalités plus tard.

## Passage BMPM → BSPP (migration v12)

Exécute **une fois** `db/migration_v12_bspp_grades.sql` dans Neon (après la v11).
Les grades deviennent ceux de la BSPP (Sapeur 2e/1re classe, Caporal, Caporal-chef,
Sergent, Sergent-chef, Adjudant, Adjudant-chef, Major, Sous-lieutenant, Lieutenant,
Capitaine, Commandant, Lieutenant-colonel, Colonel, Général de brigade). Le personnel
existant est converti au grade équivalent par rang (ex. Second-maître → Sergent) et les
seuils de fonctions (chef d'agrès, etc.) suivent. Tu peux ensuite ajuster à la main
dans **Personnel**. Le blason affiché est un logo provisoire : remplace `LOGO_SRC`
dans `index.html` par le blason officiel BSPP.

## 0. Centres de secours (migration v11)

Exécute **une fois** `db/migration_v11_casernes.sql` dans l'éditeur SQL de Neon.
Elle crée la table `casernes` et rattache automatiquement les engins existants
(ex. « CIS LOUVAIN » → centre `LVN`). Ensuite, dans **Synoptique engins** :
créer un centre (code + nom), ajouter un engin directement dans un centre, ou
changer le centre d'un engin via la liste déroulante de sa carte. Supprimer un
centre ne supprime pas ses engins (ils passent « non affectés »).

> `COSSIM_FIVEM_KEY` reste accepté ; tu peux aussi utiliser `CO_FIVEM_KEY`.
> L'ancienne version Netlify (`netlify/`, `public/`, `netlify.toml`) a été
> retirée : seuls `index.html` + `api/` sont utilisés (Vercel).

## Ordre de mission sur Discord (fiche papier)

Quand tu cliques sur **Diffuser l'engagement**, les engins sélectionnés sont engagés
(statut « En route ») puis l'**ordre de mission est envoyé sur Discord sous forme de
fiche papier** (image PNG, d'après la « Procédure Rouge » BSPP) : titre
« PREMIERS DÉPARTS - NATURE - » (ou « ENGINS COMPLÉMENTAIRES » en renfort), engin
principal et adresse en gros, heure de validation, n° d'intervention, requérant, heure
de décroché, informations requérants, consignes chefs d'agrès, engins complémentaires
(et « déjà engagés » en renfort), services prévenus et opérateur. Chaque diffusion est
aussi notée dans la main courante.

1. Discord → paramètres du salon → **Intégrations → Webhooks → Nouveau webhook** → copier l'URL.
2. Vercel → **Settings → Environment Variables** → ajouter `DISCORD_WEBHOOK_URL` = cette URL.
3. **Redeploy** (les variables ne sont lues qu'au déploiement suivant).

Aucune migration SQL. L'image est générée côté serveur (`api/_ordre-fiche.js`, polices
Liberation Sans dans `assets/fonts/`, licence SIL OFL). Si la génération de l'image
échoue, un message texte est envoyé à la place ; si le webhook est absent ou en erreur,
l'engagement est quand même effectué et une alerte s'affiche. L'URL du webhook reste
côté serveur.

## Lancer en local

```bash
npm install          # installe bcryptjs, jsonwebtoken, @neondatabase/serverless
npm install -g vercel
vercel dev           # et NON "netlify dev"
```

## 1. Créer la base sur Neon (si pas déjà fait)

1. Dans ton projet Neon, ouvre l'éditeur SQL (ou connecte-toi avec `psql`).
2. Exécute l'intégralité du fichier [`db/schema.sql`](db/schema.sql).
3. Récupère la chaîne de connexion (`DATABASE_URL`) depuis le dashboard Neon
   (onglet **Connection Details**, format
   `postgresql://user:password@host/dbname?sslmode=require`).

Si tu avais déjà une base Neon utilisée avec la version Netlify, **inutile
de la recréer** : réutilise la même chaîne de connexion.

## 2. Déployer sur Vercel

1. Pousse ce dossier sur un dépôt Git (GitHub/GitLab/Bitbucket), puis
   « Add New... → Project » sur vercel.com et importe le dépôt.
   Vercel détecte automatiquement le dossier `api/` (fonctions serverless)
   et sert `index.html` à la racine — **aucune configuration de build à
   faire**, laisse "Framework Preset" sur "Other".
2. Dans **Project Settings → Environment Variables**, ajoute :
   - `DATABASE_URL` : la chaîne de connexion Neon.
   - `JWT_SECRET` : une chaîne aléatoire longue et secrète. Génère-la avec :
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - `VSAV_SITE_URL` (optionnel) : uniquement si tu utilises l'envoi
     automatique de l'ordre de mission vers le site de la tablette VSAV.
3. Déploie. Si tu préfères la CLI plutôt que l'import Git :
   ```bash
   npm install -g vercel
   vercel login
   vercel --prod
   ```
   (la CLI te proposera de créer les variables d'environnement au premier
   déploiement, ou utilise `vercel env add DATABASE_URL production` etc.)

## 3. Créer le premier compte administrateur

`db/schema.sql` crée déjà un compte admin de démarrage — vérifie ses
identifiants dans le fichier (section `INSERT INTO personnel`). Change son
mot de passe dès la première connexion via la gestion du personnel, ou
génère un nouveau hash avec :
```bash
npm run hash -- "TonNouveauMotDePasse"
```
puis mets à jour la colonne `password_hash` correspondante sur Neon.

## Vérifier après déploiement

- `https://ton-projet.vercel.app/` → l'application se charge et affiche
  l'écran de connexion.
- Connecte-toi, puis vérifie que le synoptique des engins, la création
  d'intervention, l'engagement de moyens et le planning fonctionnent tous
  (ils passent chacun par une fonction fusionnée différente — un test
  rapide de chaque écran couvre les 7 fonctions).
- En cas d'erreur, regarde l'onglet **Deployments → [ton déploiement] →
  Functions** sur le dashboard Vercel pour voir les logs d'erreur exacts
  de la fonction concernée.

## Notes techniques

- Les fonctions utilisent le paquet `@neondatabase/serverless`
  (pas de package Netlify-spécifique), donc portable tel quel entre
  hébergeurs — c'est ce qui a permis cette conversion sans réécrire la
  logique métier ni le schéma de base de données.
- `vercel.json` ne contient que des `rewrites` (redirections internes) :
  aucune règle ne casse le comportement existant, elles ajoutent juste un
  paramètre `?type=` ou `?resource=` avant de transmettre la requête
  (méthode HTTP, corps, autres paramètres de requête restent intacts).
- Si tu ajoutes un nouvel écran nécessitant une nouvelle route d'API,
  privilégie l'ajout d'un `case` dans `reference.js` / `intervention-sub.js`
  / `planning.js` (ou la création d'un fichier séparé si la logique est
  substantielle) plutôt qu'un nouveau fichier à chaque fois, pour rester
  loin de la limite de 12.


## 4. Intégration CO ↔ FiveM / Sonoran Radio

Cette version ajoute `api/fivem.js` et `db/migration_v10_fivem_bindings.sql`.

### Principe

Le serveur FiveM, et non le client, communique avec CO. Le joueur utilise
`/connect MATRICULE` une fois. CO mémorise l'identifiant `license:` FiveM
et retrouve automatiquement l'engin auquel ce matricule est affecté dans la
feuille de garde du jour.

Les touches `1` à `9` peuvent ensuite changer le statut de cet engin :

| Touche | Statut |
|---:|---|
| 1 | En route |
| 2 | Sur les lieux |
| 3 | Message |
| 4 | Message Urgent |
| 5 | Transport CH |
| 6 | Arrivé CH |
| 7 | Disponible Radio |
| 8 | Indisponible |
| 9 | Rentré |

Le statut est écrit dans `engins`. S'il existe un engagement actif, son
`intervention_engins.etat` est synchronisé et un message est ajouté à la
main courante lorsque le statut change.

### Variable Vercel

Ajouter `CO_FIVEM_KEY` dans les variables d'environnement Vercel. Cette clé
est secrète et doit être connue uniquement du serveur FiveM.

### Migration Neon

Exécuter une fois : `db/migration_v10_fivem_bindings.sql`.

### Ressource FiveM

Le dossier `fivem/cossim_bridge` fourni dans cette archive est une ressource
indépendante à démarrer après Sonoran Radio. Elle ne modifie pas le code de
Sonoran Radio et permet de conserver les mises à jour officielles de Sonoran.

Pour la liaison : `/connect 1234`.
Pour retirer la liaison : `/cossimdisconnect`.
Les touches 1–9 sont enregistrées comme key mappings FiveM et restent
personnalisables dans `GTA → Settings → Key Bindings → FiveM`.

### Important concernant les boutons physiques de la radio

Les skins Sonoran Radio permettent actuellement de définir des zones cliquables,
mais les actions documentées sont `power`, `next_preset`, `prev_preset`, `panic`,
`home` et `hide`. Les boutons 1–9 de l'image ne peuvent donc pas être transformés
en actions CO uniquement avec `skin.json`. Pour obtenir exactement le
comportement « clic sur le bouton 1 de la radio → En route », il faut ajouter
une action personnalisée dans la NUI de Sonoran Radio ou créer un petit fork de
la ressource. La ressource CO fournie ici prépare l'API et le pont FiveM sans
modifier Sonoran Radio.
