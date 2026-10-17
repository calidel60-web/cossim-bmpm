Config = {}

-- URL publique de ton CO Vercel, sans slash final.
Config.CossimUrl = 'https://TON-COSSIM.vercel.app'

-- Même valeur que la variable Vercel CO_FIVEM_KEY (ou COSSIM_FIVEM_KEY).
-- NE JAMAIS mettre cette clé dans client.lua.
Config.BridgeKey = 'CHANGE-ME'

-- Identifiant FiveM utilisé pour lier le joueur. license est le choix recommandé.
Config.IdentifierPrefix = 'license:'

Config.Statuses = {
    [1] = 'en_route',
    [2] = 'sur_les_lieux',
    [3] = 'message',
    [4] = 'message_urgent',
    [5] = 'transport_ch',
    [6] = 'arrive_ch',
    [7] = 'disponible_radio',
    [8] = 'indisponible',
    [9] = 'rentre',
}
