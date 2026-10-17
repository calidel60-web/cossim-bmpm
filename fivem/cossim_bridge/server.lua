local function primaryIdentifier(source)
    local identifiers = GetPlayerIdentifiers(source)
    local preferred = Config.IdentifierPrefix or 'license:'

    for _, identifier in ipairs(identifiers) do
        if identifier:sub(1, #preferred) == preferred then
            return identifier
        end
    end

    for _, identifier in ipairs(identifiers) do
        if identifier:sub(1, 8) == 'license:' then
            return identifier
        end
    end

    return identifiers[1]
end

local function notify(source, message, isError)
    TriggerClientEvent('chat:addMessage', source, {
        color = isError and {255, 80, 80} or {60, 220, 150},
        args = {'CO', message}
    })
end

local function requestCossim(source, payload, cb)
    if not Config.CossimUrl or Config.CossimUrl:find('TON%-COSSIM') then
        notify(source, 'Config.CossimUrl n\'est pas configurée.', true)
        return
    end
    if not Config.BridgeKey or Config.BridgeKey == 'CHANGE-ME' then
        notify(source, 'Config.BridgeKey n\'est pas configurée.', true)
        return
    end

    PerformHttpRequest(
        Config.CossimUrl .. '/api/fivem',
        function(statusCode, responseBody, headers)
            local data = nil
            if responseBody and responseBody ~= '' then
                local ok, decoded = pcall(json.decode, responseBody)
                if ok then data = decoded end
            end
            cb(statusCode, data)
        end,
        'POST',
        json.encode(payload),
        {
            ['Content-Type'] = 'application/json',
            ['X-COSSIM-BRIDGE-KEY'] = Config.BridgeKey,
        }
    )
end

RegisterCommand('connect', function(source, args)
    if source == 0 then return end

    local matricule = tostring(args[1] or ''):gsub('^%s+', ''):gsub('%s+$', '')
    if matricule == '' then
        notify(source, 'Utilisation : /connect MATRICULE', true)
        return
    end

    local identifier = primaryIdentifier(source)
    if not identifier then
        notify(source, 'Impossible de récupérer ton identifiant FiveM.', true)
        return
    end

    requestCossim(source, {
        op = 'connect',
        identifier = identifier,
        matricule = matricule,
        fivem_name = GetPlayerName(source) or 'Joueur FiveM',
    }, function(statusCode, data)
        if statusCode >= 200 and statusCode < 300 and data then
            notify(source, data.message or ('Connecté à ' .. matricule))
        else
            notify(source, (data and data.error) or ('Erreur CO HTTP ' .. tostring(statusCode)), true)
        end
    end)
end, false)

RegisterNetEvent('cossim_bridge:setStatus', function(number)
    local source = source
    number = tonumber(number)
    local statut = Config.Statuses[number]
    if not statut then return end

    local identifier = primaryIdentifier(source)
    if not identifier then
        notify(source, 'Identifiant FiveM introuvable.', true)
        return
    end

    requestCossim(source, {
        op = 'status',
        identifier = identifier,
        fivem_name = GetPlayerName(source) or 'Joueur FiveM',
        statut = statut,
    }, function(statusCode, data)
        if statusCode >= 200 and statusCode < 300 and data then
            notify(source, (data.engin and data.engin.nom or 'Engin') .. ' → ' .. (data.statut or statut))
        elseif statusCode ~= 0 then
            notify(source, (data and data.error) or ('Erreur CO HTTP ' .. tostring(statusCode)), true)
        end
    end)
end)

RegisterNetEvent('cossim_bridge:disconnect', function()
    local source = source
    local identifier = primaryIdentifier(source)
    if not identifier then return end

    requestCossim(source, { op = 'disconnect', identifier = identifier }, function(statusCode, data)
        if statusCode >= 200 and statusCode < 300 then
            notify(source, 'Liaison CO supprimée.')
        else
            notify(source, (data and data.error) or ('Erreur CO HTTP ' .. tostring(statusCode)), true)
        end
    end)
end)

AddEventHandler('playerDropped', function()
    -- On conserve volontairement la liaison en base pour permettre une reconnexion
    -- sans refaire la procédure si le joueur revient pendant sa garde.
end)
