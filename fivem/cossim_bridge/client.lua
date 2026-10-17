local statusCommands = {
    [1] = 'cossim_status_1',
    [2] = 'cossim_status_2',
    [3] = 'cossim_status_3',
    [4] = 'cossim_status_4',
    [5] = 'cossim_status_5',
    [6] = 'cossim_status_6',
    [7] = 'cossim_status_7',
    [8] = 'cossim_status_8',
    [9] = 'cossim_status_9',
}

for number, command in pairs(statusCommands) do
    RegisterCommand('+' .. command, function()
        TriggerServerEvent('cossim_bridge:setStatus', number)
    end, false)

    RegisterCommand('-' .. command, function() end, false)
    RegisterKeyMapping('+' .. command, ('CO - statut %d'):format(number), 'keyboard', tostring(number))
end

RegisterCommand('cossimdisconnect', function()
    TriggerServerEvent('cossim_bridge:disconnect')
end, false)
