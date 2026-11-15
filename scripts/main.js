// ==========================================
// 1. НАСТРОЙКИ И КОНСТАНТЫ
// ==========================================
const CONFIG = {
    folderName: "Наше ненадежное будущее",
    bloodPath: "system.advantages.bloodpool.temporary",
    bloodMax: "system.advantages.bloodpool.max",
    willPath: "system.advantages.willpower.temporary",
    willMax: "system.advantages.willpower.max",
    willPerm: "system.advantages.willpower.permanent",
    healthPath: "system.health.damage"
};

// ==========================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function getPlayerActors() {
    const folder = game.folders.find(f => f.name === CONFIG.folderName && f.type === "Actor");
    if (!folder) return [];
    return game.actors.filter(a => a.folder?.id === folder.id);
}

function getNPCActors() {
    const folder = game.folders.find(f => f.name === CONFIG.folderName && f.type === "Actor");
    const playerIds = folder ? game.actors.filter(a => a.folder?.id === folder.id).map(a => a.id) : [];
    return game.actors.filter(a => !playerIds.includes(a.id)).sort((a, b) => a.name.localeCompare(b.name));
}

function getParentName(actor, parentId) {
    if (!parentId) return "Прочие силы";
    let parentItem = actor.items.get(parentId) || actor.items.find(i => i.name.toLowerCase() === parentId.toLowerCase());
    if (parentItem) return parentItem.name;
    return parentId.length > 15 ? "Дисциплины" : (parentId.charAt(0).toUpperCase() + parentId.slice(1));
}

function getGroupedPowerOptions(actor) {
    const powers = actor.items.filter(i => 
        i.type === "Power" && 
        (i.system.type === "wod.types.discipline" || i.system.type === "wod.types.disciplinepower") &&
        i.system.level > 0
    );

    const grouped = {};
    powers.forEach(p => {
        let parentName = getParentName(actor, p.system.parentid);
        if (!grouped[parentName]) grouped[parentName] = [];
        grouped[parentName].push(p);
    });

    const sortedParents = Object.keys(grouped).sort();
    let html = "";
    
    sortedParents.forEach(parent => {
        html += `<optgroup label="${parent}">`;
        grouped[parent].sort((a, b) => Number(a.system.level) - Number(b.system.level));
        grouped[parent].forEach(p => {
            const hasRoll = p.system.dice1 !== "" && p.system.dice1 !== null;
            const rollText = hasRoll ? "" : " (Без броска)";
            html += `<option value="${p.id}">${p.name} (Ур. ${p.system.level})${rollText}</option>`;
        });
        html += `</optgroup>`;
    });
    return html;
}

// ==========================================
// 3. ИНИЦИАЛИЗАЦИЯ (ХУКИ)
// ==========================================
Hooks.on("ready", () => {
    console.log("WoD Master Panel | Инициализация...");

    // Добавляем кнопку на панель управления сценой (Token Controls)
    Hooks.on("getSceneControlButtons", (controls) => {
        const tokenControls = controls.find(c => c.name === "token");
        if (tokenControls) {
            tokenControls.tools.push({
                name: "wod-panel",
                title: "WoD Master Panel",
                icon: "fas fa-dice-d20",
                button: true,
                onClick: () => openMainPanel()
            });
        }
    });
});

// ==========================================
// 4. ОСНОВНОЕ ОКНО (ИНТЕРФЕЙС)
// ==========================================
async function openMainPanel() {
    const isGM = game.user.isGM;
    const template = await renderTemplate("modules/wod-master-panel/templates/panel.html", {});
    
    new Dialog({
        title: "WoD Master Panel",
        content: template,
        buttons: {
            close: { label: "Закрыть" },
            useDisc: {
                label: "Использовать",
                callback: (html) => { executeDiscipline(html); }
            }
        },
        render: (html) => {
            setupPanelLogic(html, isGM);
        }
    }, { width: 550, height: 700, resizable: true }).render(true);
}

// ==========================================
// 5. ЛОГИКА ПАНЕЛИ
// ==========================================
function setupPanelLogic(html, isGM) {
    // --- Переключение вкладок ---
    html.find('.wod-tab-btn').click(function() {
        html.find('.wod-tab-btn').removeClass('active');
        html.find('.wod-tab-content').removeClass('active');
        $(this).addClass('active');
        html.find('#' + $(this).data('tab')).addClass('active');
        
        // Скрываем/Показываем кнопку Использовать в зависимости от вкладки
        const dialogButtons = html.closest('.dialog').find('.dialog-buttons');
        if ($(this).data('tab') === 'tab-disciplines') {
            dialogButtons.find('.useDisc').show();
        } else {
            dialogButtons.find('.useDisc').hide();
        }
    });

    // --- Заполнение списков ---
    const players = getPlayerActors();
    const npcs = getNPCActors();

    // 1. Вкладка Здоровье
    let healthActorsHTML = `<button type="button" class="wod-actor-btn" data-id="ALL">★ ВСЕ ПЕРСОНАЖИ ★</button>`;
    players.forEach(p => healthActorsHTML += `<button type="button" class="wod-actor-btn" data-id="${p.id}">${p.name}</button>`);
    html.find('#health-actor-list').html(healthActorsHTML);
    
    if (isGM) {
        let npcOptions = `<option value="">Не выбрано</option>`;
        npcs.forEach(n => npcOptions += `<option value="${n.id}">${n.name}</option>`);
        html.find('#health-npc-select').html(npcOptions);
        html.find('#health-npc-block').show();
    }

    // 2. Вкладка Ресурсы
    let resActorsHTML = `<button type="button" class="wod-actor-btn" data-id="ALL">★ ВСЕ ПЕРСОНАЖИ ★</button>`;
    players.forEach(p => resActorsHTML += `<button type="button" class="wod-actor-btn" data-id="${p.id}">${p.name}</button>`);
    html.find('#res-actor-list').html(resActorsHTML);
    
    if (isGM) {
        let npcOptions = `<option value="">Не выбрано</option>`;
        npcs.forEach(n => npcOptions += `<option value="${n.id}">${n.name}</option>`);
        html.find('#res-npc-select').html(npcOptions);
        html.find('#res-npc-block').show();
    }

    // 3. Вкладка Дисциплины
    if (isGM) {
        let discOptions = `<option value="">Не выбрано</option>`;
        const actorsWithPowers = game.actors.contents.filter(a => a.items.some(i => i.type === "Power" && i.system.level > 0)).sort((a,b) => a.name.localeCompare(b.name));
        actorsWithPowers.forEach(n => discOptions += `<option value="${n.id}">${n.name}</option>`);
        html.find('#disc-npc-select').html(discOptions);
        html.find('#disc-npc-block').show();
        html.find('#disc-actor-block').hide(); // Скрываем выбор игроков для ГМа
    } else {
        let actorOptions = "";
        players.filter(a => a.items.some(i => i.type === "Power" && i.system.level > 0)).forEach(a => actorOptions += `<option value="${a.id}">${a.name}</option>`);
        html.find('#disc-actor-select').html(actorOptions);
    }

    // --- Генерация кнопок урона и ресурсов ---
    function createGrid(targetId, type, isDamage) {
        let htmlGrid = "";
        if (isDamage) {
            for (let i = -7; i <= -1; i++) htmlGrid += `<button type="button" class="wod-grid-btn wod-btn-heal" data-type="${type}" data-val="${i}">${i}</button>`;
            for (let i = 1; i <= 7; i++) htmlGrid += `<button type="button" class="wod-grid-btn wod-btn-dmg" data-type="${type}" data-val="${i}">+${i}</button>`;
        } else {
            for (let i = -10; i <= 10; i++) {
                let cls = i === 0 ? 'wod-btn-zero' : 'wod-btn-blood';
                htmlGrid += `<button type="button" class="wod-grid-btn ${cls}" data-type="${type}" data-val="${i}">${i > 0 ? '+' + i : i}</button>`;
            }
        }
        html.find(targetId).html(htmlGrid);
    }
    createGrid('#grid-bashing', 'bashing', true);
    createGrid('#grid-lethal', 'lethal', true);
    createGrid('#grid-aggravated', 'aggravated', true);
    createGrid('#grid-blood', 'blood', false);
    createGrid('#grid-will', 'will', false);

    // --- Обработка кликов по кнопкам персонажей (мультивыбор) ---
    html.find('.wod-actor-btn').click(function(e) {
        // Сброс NPC при клике на игрока
        if (isGM) {
            const parentTab = $(this).closest('.wod-tab-content');
            parentTab.find('select').val("");
        }

        if ($(this).data('id') === "ALL") {
            const isActive = $(this).hasClass('active');
            $(this).closest('.wod-tab-content').find('.wod-actor-btn').removeClass('active');
            if (!isActive) $(this).addClass('active');
        } else {
            $(this).closest('.wod-tab-content').find('.wod-actor-btn[data-id="ALL"]').removeClass('active');
            $(this).toggleClass('active');
        }
    });

    // --- Обработка кликов по сеткам Здоровья ---
    html.find('#tab-health .wod-grid-btn').click(function() {
        const type = $(this).data('type');
        const val = parseInt($(this).data('val'));
        const useBlood = html.find('#health-use-blood').is(':checked');
        const npcId = isGM ? html.find('#health-npc-select').val() : "";
        processHealthAction(html, type, val, useBlood, npcId, players);
    });

    // --- Обработка кликов по сеткам Ресурсов ---
    html.find('#tab-resources .wod-grid-btn').click(function() {
        const type = $(this).data('type');
        const val = parseInt($(this).data('val'));
        const npcId = isGM ? html.find('#res-npc-select').val() : "";
        processResourceAction(html, type, val, npcId, players);
    });

    // --- Логика вкладки Дисциплины ---
    const updateDiscUI = () => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        html.find('#disc-power-select').html(getGroupedPowerOptions(actor));
        updatePowerDetails();
    };

    const updatePowerDetails = () => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId);
        if (!actor) return;
        
        const power = actor.items.get(html.find('#disc-power-select').val());
        if (!power) return;

        // Сложность
        let diff = Number(power.system.difficulty);
        if (isNaN(diff) || diff === 0) diff = 6;
        html.find('#disc-difficulty').val(diff);

        // Описание
        let desc = power.system.description || "Нет описания.";
        if (power.system.details) desc += `<hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;">` + power.system.details;
        html.find('#disc-description').html(desc);

        // Специализация
        const skillKey = power.system.dice2;
        if (skillKey) {
            const skill = foundry.utils.getProperty(actor, `system.abilities.${skillKey}`);
            if (skill && skill.speciality && skill.speciality.trim() !== "") {
                html.find('#disc-spec-name').text(skill.speciality);
                html.find('#disc-spec-block').show();
            } else {
                html.find('#disc-spec-block').hide();
            }
        } else {
            html.find('#disc-spec-block').hide();
        }
        html.find('#disc-use-spec').prop('checked', false);

        updateFinalDiscCost(actor, power);
    };

    const updateFinalDiscCost = (actor, power) => {
        const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
        const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
        const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

        let reqHTML = "";
        if (bloodMatch) {
            if (bloodMatch[1].toLowerCase() === "x") {
                reqHTML += `<div style="color: #8b0000; margin-bottom: 5px; display: flex; align-items: center;"><span style="margin-right: 10px;">Требуется Кровь (bp):</span><input type="number" id="input-blood-x" value="1" min="0" style="width: 50px; padding: 2px; border: 1px solid #999; border-radius: 3px; color: #000;"></div>`;
            } else {
                reqHTML += `<div style="color: #8b0000; margin-bottom: 5px;">• Требуется Кровь: ${bloodMatch[1]} bp</div>`;
            }
        }
        if (willMatch) {
            if (willMatch[1].toLowerCase() === "x") {
                reqHTML += `<div style="color: #00008b; margin-bottom: 5px; display: flex; align-items: center;"><span style="margin-right: 10px;">Требуется Воля (wp):</span><input type="number" id="input-will-x" value="1" min="0" style="width: 50px; padding: 2px; border: 1px solid #999; border-radius: 3px; color: #000;"></div>`;
            } else {
                reqHTML += `<div style="color: #00008b; margin-bottom: 5px;">• Требуется Воля: ${willMatch[1]} wp</div>`;
            }
        }

        if (reqHTML) {
            html.find('#disc-req-block').html(reqHTML).show();
            html.find('#disc-req-block input').on('input', () => updateFinalCostDisplay(actor, power));
        } else {
            html.find('#disc-req-block').hide();
        }
        
        updateFinalCostDisplay(actor, power);
    };

    const updateFinalCostDisplay = (actor, power) => {
        const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
        const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
        const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

        let bCost = 0;
        let wCost = 0;

        if (bloodMatch) {
            bCost = bloodMatch[1].toLowerCase() === "x" ? (Number(html.find('#input-blood-x').val()) || 0) : Number(bloodMatch[1]);
        }
        if (willMatch) {
            wCost = willMatch[1].toLowerCase() === "x" ? (Number(html.find('#input-will-x').val()) || 0) : Number(willMatch[1]);
        }

        if (html.find('#disc-use-will').is(':checked')) wCost += 1;

        let parts = [];
        if (bCost > 0) parts.push(`${bCost} Кровь`);
        if (wCost > 0) parts.push(`${wCost} Воля`);

        if (parts.length > 0) {
            html.find('#disc-final-cost').html(`Итоговая стоимость: <span style="color: #8b0000;">${parts.join(' | ')}</span>`);
        } else {
            html.find('#disc-final-cost').html(`Итоговая стоимость: <span style="color: #2e6b4e;">Нет</span>`);
        }
    };

    // Слушатели для Дисциплин
    if (isGM) html.find('#disc-npc-select').change(updateDiscUI);
    else html.find('#disc-actor-select').change(updateDiscUI);
    html.find('#disc-power-select').change(updatePowerDetails);
    html.find('#disc-use-will').change(() => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId);
        if (actor) updateFinalCostDisplay(actor, actor.items.get(html.find('#disc-power-select').val()));
    });

    // Инициализация вкладки Дисциплины
    updateDiscUI();
    
    // Изначально скрываем кнопку "Использовать", так как открыта вкладка Здоровья
    html.closest('.dialog').find('.dialog-buttons').find('.useDisc').hide();
}
