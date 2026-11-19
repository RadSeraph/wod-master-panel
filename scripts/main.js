// ==========================================
// МОДУЛЬ: WoD Master Panel
// Файл: scripts/main.js (Версия 3.0 - единая суммирующаяся шкала на 7 ячеек:
// все типы урона занимают общие ячейки; новый тип заполняет только свободные
// ячейки и не может вытеснить уже нанесённый урон; при переполнении избыток
// повышается по тяжести: дробящий -> летальный, летальный -> аггравированный,
// а если повышать дальше некуда — избыток аггравированного теряется)
// ==========================================

const CONFIG = {
    folderName: "Наше ненадежное будущее",
    bloodPath: "system.advantages.bloodpool.temporary",
    bloodMax: "system.advantages.bloodpool.max",
    bloodPerTurn: "system.advantages.bloodpool.perturn",
    willPath: "system.advantages.willpower.temporary",
    willMax: "system.advantages.willpower.max",
    willPerm: "system.advantages.willpower.permanent",
    healthPath: "system.health.damage",
    healthStatePath: "system.health.penalite"
};

// =========================================
// ШТРАФЫ ОТ РАН
// Шкала здоровья единая и суммирующаяся: всего 7 ячеек на все типы урона
// вместе. Пример: 2 bashing + 2 lethal + 2 aggravated = 6 заполненных ячеек,
// свободна 1 ячейка — новый тип урона займёт не больше одной ячейки.
// Переполнение (V20): если для урона нового типа не хватило свободных ячеек,
// избыток повышается по тяжести: дробящий -> летальный, летальный ->
// аггравированный; избыток аггравированного теряется (персонаж уже мертв).
// Состояние здоровья берется из материнской системы Foundry (WoD20):
// читаем system.health.penalite — состояние ("Health.Trauma.X"),
// которое система сама вычисляет по суммарному урону актёра.
// Если поле недоступно, состояние определяется по суммарному урону.
// Таблица штрафов (согласно правилам):
//   Помят            0
//   Легко ранен     -1
//   Ранен           -1
//   Серьезно ранен  -2
//   Тяжело ранен    -2
//   Едва жив        -5
//   При смерти — бросать кубики нельзя (действие недопустимо)
// =========================================
const WOUND_PENALTIES = {
    "bruised":      { name: "Помят",         penalty: 0 },
    "battered":     { name: "Легко ранен",   penalty: -1 },
    "injured":      { name: "Ранен",         penalty: -1 },
    "wounded":      { name: "Серьезно ранен",penalty: -2 },
    "disabled":     { name: "Тяжело ранен",  penalty: -2 },
    "dying":        { name: "Едва жив",      penalty: -5 },
    "incapacitated":{ name: "При смерти",    penalty: null } // null => действие недопустимо
};

// Индексы состояний по суммарному количеству урона (фолбэк-таблица)
const WOUND_BY_DAMAGE = ["bruised", "battered", "injured", "wounded", "disabled", "dying", "incapacitated"];

function getWoundInfo(actor) {
    const health = foundry.utils.getProperty(actor, CONFIG.healthPath);
    const totalDamage = health
        ? (Number(health.bashing) || 0) + (Number(health.lethal) || 0) + (Number(health.aggravated) || 0)
        : 0;

    // 1) Пробуем взять состояние из материнской системы Foundry.
    let stateKey = null;
    const rawState = foundry.utils.getProperty(actor, CONFIG.healthStatePath);
    if (typeof rawState === "string") {
        const last = rawState.split(".").pop().toLowerCase(); // "Health.Trauma.Wounded" -> "wounded"
        if (WOUND_PENALTIES[last]) stateKey = last;
    } else if (typeof rawState === "number" && WOUND_BY_DAMAGE[rawState]) {
        stateKey = WOUND_BY_DAMAGE[rawState];
    }

    // 2) Фолбэк: определяем состояние по суммарному количеству заполненных ячеек.
    //    Урон разных типов не конвертируется, а складывается на шкале:
    //    0-1 урона — Помят; 2 — Легко ранен; ... 7+ — При смерти.
    if (!stateKey) {
        stateKey = totalDamage <= 1 ? "bruised" : WOUND_BY_DAMAGE[Math.min(totalDamage - 1, 6)];
    }

    const state = WOUND_PENALTIES[stateKey];
    return {
        dying: state.penalty === null,
        penalty: state.penalty === null ? null : (Number(state.penalty) || 0),
        stateName: state.name
    };
}

function getPlayerActors() {
    const folder = game.folders.find(f => f.name === CONFIG.folderName && f.type === "Actor");
    if (!folder) return [];
    let actors = game.actors.filter(a => a.folder?.id === folder.id);
    if (!game.user.isGM) {
        actors = actors.filter(a => a.id === game.user.character?.id);
    }
    return actors;
}

function getNPCActors() {
    const folder = game.folders.find(f => f.name === CONFIG.folderName && f.type === "Actor");
    const playerIds = folder ? game.actors.filter(a => a.folder?.id === folder.id).map(a => a.id) : [];
    return game.actors.filter(a => !playerIds.includes(a.id)).sort((a, b) => a.name.localeCompare(b.name));
}

// Экранирование пользовательских строк (имена актёров/сил) перед вставкой в HTML.
function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

// Синие информационные уведомления «всё в порядке» с кулдауном 3 секунды
// на каждое сочетание (тип шкалы + имя актёра), чтобы частые клики не спамили.
const _statusInfoCooldown = new Map();
function statusInfo(key, message) {
    const now = Date.now();
    const last = _statusInfoCooldown.get(key) || 0;
    if (now - last < 3000) return false;
    _statusInfoCooldown.set(key, now);
    ui.notifications.info(message);
    return true;
}

// Единая обёртка ошибок для обработчиков кнопок пульта.
async function safeRun(label, fn) {
    try {
        await fn();
    } catch (e) {
        console.error(`WoD Panel | Ошибка (${label}): `, e);
        ui.notifications.error(`Ошибка: ${label}. Подробности в консоли.`);
    }
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
        html += `<optgroup label="${escapeHtml(parent)}">`;
        grouped[parent].sort((a, b) => Number(a.system.level) - Number(b.system.level));
        grouped[parent].forEach(p => {
            const hasRoll = p.system.dice1 !== "" && p.system.dice1 !== null;
            html += `<option value="${p.id}">${escapeHtml(p.name)} (Ур. ${p.system.level})${hasRoll ? "" : " (Без броска)"}</option>`;
        });
        html += `</optgroup>`;
    });
    return html;
}

function createDiceHTML(value, resultType) {
    let gradStart, gradEnd, strokeColor;

    if (resultType === 'success') {
        gradStart = '#2ecc71'; gradEnd = '#145a32'; strokeColor = '#1a7a1a';
    } else if (resultType === 'fail') {
        gradStart = '#e74c3c'; gradEnd = '#641e16'; strokeColor = '#c00000';
    } else if (resultType === 'spec') {
        gradStart = '#f1c40f'; gradEnd = '#7d6608'; strokeColor = '#d4a017';
    } else {
        gradStart = '#7f8c8d'; gradEnd = '#2c3e50'; strokeColor = '#5a5a5a';
    }

    return `
        <span style="
            display: inline-block;
            width: 28px; height: 32px;
            background: linear-gradient(145deg, ${gradStart}, ${gradEnd});
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            color: white;
            font-weight: bold;
            font-size: 16px;
            line-height: 32px;
            text-align: center;
            margin: 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            border: 1px solid ${strokeColor};
        ">${value}</span>
    `;
}

async function openMainPanel(initialTab = "tab-health") {
    const isGM = game.user.isGM;
    const template = await renderTemplate("modules/wod-master-panel/templates/panel.html", {});

    const dialog = new Dialog({
        title: "WoD Master Panel",
        content: template,
        buttons: {
            close: { label: "Закрыть" }
        },
        render: (html) => {
            setupPanelLogic(html, isGM);

            const myButton = $('<button type="button" class="wod-my-use-btn" style="margin-top: 10px; padding: 8px 16px; background: #8b0000; color: white; border: 1px solid #5c0000; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s;">Использовать</button>');
            myButton.hover(
                function() { $(this).css("background", "#a80000"); },
                function() { $(this).css("background", "#8b0000"); }
            );
            myButton.click(() => {
                safeRun("использование дисциплины", () => executeDiscipline(html));
            });
            html.find('#tab-disciplines').append(myButton);

            if (initialTab !== "tab-health") {
                html.find('.wod-tab-btn').removeClass('active');
                html.find('.wod-tab-content').removeClass('active');
                html.find(`.wod-tab-btn[data-tab="${initialTab}"]`).addClass('active');
                html.find(`#${initialTab}`).addClass('active');
            }
        }
    }, { width: 550, height: 700, resizable: true, closeOnSubmit: false });

    dialog.render(true);
}

function setupPanelLogic(html, isGM) {
    html.find('.wod-tab-btn').click(function() {
        html.find('.wod-tab-btn').removeClass('active');
        html.find('.wod-tab-content').removeClass('active');
        $(this).addClass('active');
        html.find('#' + $(this).data('tab')).addClass('active');
    });

    const players = getPlayerActors();
    const npcs = getNPCActors();

    let healthActorsHTML = "";
    if (isGM) healthActorsHTML += `<button type="button" class="wod-actor-btn" data-id="ALL">★ ВСЕ ПЕРСОНАЖИ ★</button>`;
    players.forEach(p => healthActorsHTML += `<button type="button" class="wod-actor-btn" data-id="${p.id}">${escapeHtml(p.name)}</button>`);
    html.find('#health-actor-list').html(healthActorsHTML);
    if (isGM) {
        let npcOptions = `<option value="">Не выбрано</option>`;
        npcs.forEach(n => npcOptions += `<option value="${n.id}">${escapeHtml(n.name)}</option>`);
        html.find('#health-npc-select').html(npcOptions);
        html.find('#health-npc-block').show();
    } else {
        html.find('#health-actor-list').hide();
        html.find('#health-npc-block').hide();
    }

    let resActorsHTML = "";
    if (isGM) resActorsHTML += `<button type="button" class="wod-actor-btn" data-id="ALL">★ ВСЕ ПЕРСОНАЖИ ★</button>`;
    players.forEach(p => resActorsHTML += `<button type="button" class="wod-actor-btn" data-id="${p.id}">${escapeHtml(p.name)}</button>`);
    html.find('#res-actor-list').html(resActorsHTML);
    if (isGM) {
        let npcOptions = `<option value="">Не выбрано</option>`;
        npcs.forEach(n => npcOptions += `<option value="${n.id}">${escapeHtml(n.name)}</option>`);
        html.find('#res-npc-select').html(npcOptions);
        html.find('#res-npc-block').show();
    } else {
        html.find('#res-actor-list').hide();
        html.find('#res-npc-block').hide();
    }

    if (isGM) {
        let discOptions = `<option value="">Не выбрано</option>`;
        const actorsWithPowers = game.actors.contents.filter(a => a.items.some(i => i.type === "Power" && i.system.level > 0)).sort((a,b) => a.name.localeCompare(b.name));
        actorsWithPowers.forEach(n => discOptions += `<option value="${n.id}">${escapeHtml(n.name)}</option>`);
        html.find('#disc-npc-select').html(discOptions);
        html.find('#disc-npc-block').show();
        html.find('#disc-actor-block').hide();
    } else {
        const actor = game.user.character;
        if (actor) {
            html.find('#disc-actor-select').html(`<option value="${actor.id}">${escapeHtml(actor.name)}</option>`);
            html.find('#disc-actor-block').hide();
        }
    }

    // Функция создания стрелок
    function createArrowBtn(direction, type, isDamage) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `wod-arrow-btn wod-arrow-${direction}`;

        btn.dataset.type = type;
        btn.dataset.isDamage = isDamage;
        btn.dataset.action = (direction === 'down') ? 'damage' : 'heal';

        btn.innerHTML = direction === 'up' ? '▲' : '▼';
        return btn.outerHTML;
    }

    function createGrid(targetId, type, isDamage) {
        let htmlGrid = "";
        let innerGrid = "";

        if (isDamage) {
            // ВАЖНО: Левая кнопка (-1) наносит урон (+1 в системе). Правая (+1) лечит (-1 в системе).
            for (let i = -7; i <= -1; i++) {
                innerGrid += `<button type="button" class="wod-grid-btn wod-btn-dmg" data-type="${type}" data-val="${Math.abs(i)}">${i}</button>`;
            }
            for (let i = 1; i <= 7; i++) {
                innerGrid += `<button type="button" class="wod-grid-btn wod-btn-heal" data-type="${type}" data-val="${-i}">+${i}</button>`;
            }
            htmlGrid = createArrowBtn('down', type, true) + `<div class="wod-grid">${innerGrid}</div>` + createArrowBtn('up', type, true);
        } else {
            // Для ресурсов всё логично: минус тратит, плюс восстанавливает.
            for (let i = -10; i <= 10; i++) {
                let cls = i === 0 ? 'wod-btn-zero' : 'wod-btn-blood';
                innerGrid += `<button type="button" class="wod-grid-btn ${cls}" data-type="${type}" data-val="${i}">${i > 0 ? '+' + i : i}</button>`;
            }
            htmlGrid = createArrowBtn('down', type, false) + `<div class="wod-grid">${innerGrid}</div>` + createArrowBtn('up', type, false);
        }
        html.find(targetId).html(`<div class="wod-grid-with-arrows">${htmlGrid}</div>`);
    }

    createGrid('#grid-bashing', 'bashing', true);
    createGrid('#grid-lethal', 'lethal', true);
    createGrid('#grid-aggravated', 'aggravated', true);
    createGrid('#grid-blood', 'blood', false);
    createGrid('#grid-will', 'will', false);

    html.find('.wod-actor-btn').click(function(e) {
        if (isGM) $(this).closest('.wod-tab-content').find('select').val("");
        if ($(this).data('id') === "ALL") {
            const isActive = $(this).hasClass('active');
            $(this).closest('.wod-tab-content').find('.wod-actor-btn').removeClass('active');
            if (!isActive) $(this).addClass('active');
        } else {
            $(this).closest('.wod-tab-content').find('.wod-actor-btn[data-id="ALL"]').removeClass('active');
            $(this).toggleClass('active');
        }
    });

    html.find('#tab-health .wod-grid-btn').click(function() {
        const type = $(this).data('type'); const val = parseInt($(this).data('val'));
        const useBlood = html.find('#health-use-blood').is(':checked');
        const npcId = isGM ? html.find('#health-npc-select').val() : "";
        safeRun("обработка здоровья", () => processHealthAction(html, type, val, useBlood, npcId, players));
    });

    html.find('#tab-resources .wod-grid-btn').click(function() {
        const type = $(this).data('type'); const val = parseInt($(this).data('val'));
        const npcId = isGM ? html.find('#res-npc-select').val() : "";
        safeRun("обработка ресурсов", () => processResourceAction(html, type, val, npcId, players));
    });

    html.find('.wod-arrow-btn').click(function() {
        const type = $(this).data('type');
        const action = $(this).data('action');
        const isHealthTab = $(this).closest('#tab-health').length > 0;
        const npcId = isHealthTab ? (isGM ? html.find('#health-npc-select').val() : "") : (isGM ? html.find('#res-npc-select').val() : "");

        if (isHealthTab) {
            const useBlood = html.find('#health-use-blood').is(':checked');
            safeRun("обработка здоровья", () => processHealthAction(html, type, action, useBlood, npcId, players));
        } else {
            safeRun("обработка ресурсов", () => processResourceAction(html, type, action, npcId, players));
        }
    });

    const diffContainer = html.find('#disc-difficulty-buttons');
    const diffInput = html.find('#disc-difficulty');
    const renderDifficultyButtons = (currentDiff) => {
        diffContainer.empty();
        for (let i = 3; i <= 10; i++) {
            const isActive = i === currentDiff;
            const btn = $(`<button type="button" class="wod-diff-btn ${isActive ? 'active' : ''}" data-val="${i}">${i}</button>`);
            btn.click(function() {
                const val = $(this).data('val');
                diffInput.val(val);
                renderDifficultyButtons(val);
            });
            diffContainer.append(btn);
        }
    };

    const updateDiscUI = () => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId); if (!actor) return;
        html.find('#disc-power-select').html(getGroupedPowerOptions(actor));
        updatePowerDetails();
    };

    const updatePowerDetails = () => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId); if (!actor) return;
        const power = actor.items.get(html.find('#disc-power-select').val()); if (!power) return;

        let diff = Number(power.system.difficulty);
        if (isNaN(diff) || diff === 0) diff = 6;
        diffInput.val(diff);
        renderDifficultyButtons(diff);

        // --- ЧИТАЕМ ЧЕКБОКС ИГНОРИРОВАНИЯ ШТРАФОВ ---
        const ignoreWounds = html.find('#disc-ignore-wounds').is(':checked');

        let attrInfoHTML = "";
        if (power.system.dice1) {
            const attrKey = power.system.dice1, skillKey = power.system.dice2;
            let attrValue = attrKey === "willpower" ? (Number(foundry.utils.getProperty(actor, CONFIG.willPerm)) || 0) : (Number(foundry.utils.getProperty(actor, `system.attributes.${attrKey}.total`)) || 0);
            let skillValue = skillKey ? (Number(foundry.utils.getProperty(actor, `system.abilities.${skillKey}.value`)) || 0) : 0;

            // --- ШТРАФ ОТ РАН (состояние берется из системы Foundry) ---
            const wound = getWoundInfo(actor);
            let woundPenalty = 0;
            if (!ignoreWounds && !wound.dying) woundPenalty = wound.penalty;

            attrInfoHTML = `
                <div style="margin-top: 5px; font-size: 0.9em; color: #333; background: rgba(0,0,0,0.05); padding: 5px; border-radius: 4px;">
                    <strong>Пул:</strong> ${attrKey} (${attrValue}) + ${skillKey || "0"} (${skillValue})
                    ${wound.dying ? `<span style="color: red;"><strong>При смерти: броски невозможны!</strong></span>` : ""}
                    ${!wound.dying && woundPenalty !== 0 ? `<span style="color: red;">Штраф от ран (${wound.stateName}): ${woundPenalty}</span>` : ""}
                    ${ignoreWounds ? `<span style="color: #888; font-style: italic;"> (штрафы от ран игнорируются)</span>` : ""}
                </div>
                <div style="margin-top: 5px; display: flex; align-items: center; gap: 5px;">
                    <label style="font-size: 0.9em;">Бонус/Штраф кубов:</label>
                    <input type="number" id="disc-manual-bonus" value="0" style="width: 50px; padding: 2px;">
                </div>
            `;
        }

        let descHTML = power.system.description || "Нет описания.";
        if (power.system.details) descHTML += `<hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;">` + power.system.details;

        html.find('#disc-description').html(attrInfoHTML + descHTML);

        const skillKey = power.system.dice2;
        if (skillKey) {
            const skill = foundry.utils.getProperty(actor, `system.abilities.${skillKey}`);
            if (skill && skill.speciality && skill.speciality.trim() !== "") {
                html.find('#disc-spec-name').text(skill.speciality); html.find('#disc-spec-block').show();
            } else { html.find('#disc-spec-block').hide(); }
        } else { html.find('#disc-spec-block').hide(); }
        html.find('#disc-use-spec').prop('checked', false);
        updateFinalDiscCost(actor, power);
    };

    const updateFinalDiscCost = (actor, power) => {
        const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
        const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
        const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

        let reqHTML = "";
        if (power.system.spendblood === true && !bloodMatch) reqHTML += `<div style="color: #8b0000; margin-bottom: 5px;">• Требуется Кровь: 1 bp</div>`;
        if (bloodMatch) {
            if (bloodMatch[1].toLowerCase() === "x") reqHTML += `<div style="color: #8b0000; margin-bottom: 5px; display: flex; align-items: center;"><span style="margin-right: 10px;">Требуется Кровь (bp):</span><input type="number" id="input-blood-x" value="1" min="0" style="width: 50px; padding: 2px; border: 1px solid #999; border-radius: 3px; color: #000;"></div>`;
            else reqHTML += `<div style="color: #8b0000; margin-bottom: 5px;">• Требуется Кровь: ${bloodMatch[1]} bp</div>`;
        }
        if (willMatch) {
            if (willMatch[1].toLowerCase() === "x") reqHTML += `<div style="color: #00008b; margin-bottom: 5px; display: flex; align-items: center;"><span style="margin-right: 10px;">Требуется Воля (wp):</span><input type="number" id="input-will-x" value="1" min="0" style="width: 50px; padding: 2px; border: 1px solid #999; border-radius: 3px; color: #000;"></div>`;
            else reqHTML += `<div style="color: #00008b; margin-bottom: 5px;">• Требуется Воля: ${willMatch[1]} wp</div>`;
        }

        if (reqHTML) {
            html.find('#disc-req-block').html(reqHTML).show();
            html.find('#disc-req-block input').on('input', () => updateFinalCostDisplay(actor, power));
        } else { html.find('#disc-req-block').hide(); }
        updateFinalCostDisplay(actor, power);
    };

    const updateFinalCostDisplay = (actor, power) => {
        const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
        const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
        const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

        let bCost = 0, wCost = 0;
        if (power.system.spendblood === true && !bloodMatch) bCost = 1;
        if (bloodMatch) bCost = bloodMatch[1].toLowerCase() === "x" ? (Number(html.find('#input-blood-x').val()) || 0) : Number(bloodMatch[1]);
        if (willMatch) wCost = willMatch[1].toLowerCase() === "x" ? (Number(html.find('#input-will-x').val()) || 0) : Number(willMatch[1]);
        if (html.find('#disc-use-will').is(':checked')) wCost += 1;

        let parts = [];
        if (bCost > 0) parts.push(`<span style="color: #8b0000; font-weight: bold;">${bCost} Кровь</span>`);
        if (wCost > 0) parts.push(`${wCost} Воля`);

        if (parts.length > 0) html.find('#disc-final-cost').html(`Итоговая стоимость: ${parts.join(' | ')}`);
        else html.find('#disc-final-cost').html(`Итоговая стоимость: <span style="color: #2e6b4e;">Нет</span>`);
    };

    if (isGM) html.find('#disc-npc-select').change(updateDiscUI);
    else html.find('#disc-actor-select').change(updateDiscUI);
    html.find('#disc-power-select').change(updatePowerDetails);
    html.find('#disc-use-will').change(() => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId);
        if (actor) updateFinalCostDisplay(actor, actor.items.get(html.find('#disc-power-select').val()));
    });
    // --- ОБРАБОТЧИК ЧЕКБОКСА ИГНОРИРОВАНИЯ ШТРАФОВ ---
    html.find('#disc-ignore-wounds').change(updatePowerDetails);

    html.find('#disc-description').on('change', '#disc-manual-bonus', () => {
        let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
        const actor = game.actors.get(actorId);
        if (actor) updateFinalCostDisplay(actor, actor.items.get(html.find('#disc-power-select').val()));
    });

    updateDiscUI();
}

async function processHealthAction(html, type, value, useBlood, npcId, players) {
    let targets = [];
    if (npcId) { targets = [game.actors.get(npcId)]; } else {
        const activeBtns = html.find('.wod-tab-content.active .wod-actor-btn.active');
        if (activeBtns.length === 0 && game.user.character) {
            targets = [game.user.character];
        } else if (activeBtns.length === 0) {
            return ui.notifications.warn("Выберите персонажа!");
        } else if (html.find('.wod-actor-btn[data-id="ALL"].active').length > 0) {
            targets = players;
        } else {
            activeBtns.each(function() { targets.push(game.actors.get($(this).data('id'))); });
        }
    }
    const namesMap = { bashing: "Дробящий", lethal: "Летальный", aggravated: "Аггравированный" };
    let updatedCount = 0, totalBloodCost = 0;

    for (const actor of targets) {
        if (!actor) continue;
        const current = foundry.utils.getProperty(actor, CONFIG.healthPath);
        if (!current) { ui.notifications.warn(`${actor.name}: нет поля Здоровья!`); continue; }

        let b = Number(current.bashing) || 0;
        let l = Number(current.lethal) || 0;
        let a = Number(current.aggravated) || 0;
        let bloodCost = 0;

        let processValue = value;
        if (value === "damage") processValue = 7;
        else if (value === "heal") processValue = -7;

        if (processValue > 0) {
            // НАКОПЛЕНИЕ: шкала здоровья ЕДИНАЯ и суммирующаяся — всего 7 ячеек
            // на все типы урона вместе. Новый урон занимает только СВОБОДНЫЕ
            // ячейки и не может вытеснить уже нанесённый урон другого типа.
            // Пример: 3 bashing + 3 lethal заняли 6 из 7 ячеек -> aggravated
            // сможет занять не больше 1 свободной ячейки.
            const MAXD = 7;
            const occupied = b + l + a;
            const free = Math.max(0, MAXD - occupied);
            let incoming = Math.min(processValue, free); // умещается в свободные ячейки
            let overflow = processValue - incoming;      // избыток, идущий по правилам V20

            if (type === "bashing") b += incoming;
            else if (type === "lethal") l += incoming;
            else if (type === "aggravated") a += incoming;

            // ПЕРЕПОЛНЕНИЕ (правила V20): избыток, для которого не хватило
            // свободных ячеек, повышается по тяжести:
            //   дробящий -> летальный, летальный -> аггравированный.
            // Повышение тоже ограничено общими 7 ячейками: если свободных
            // ячеек нет (такое возможно только при повреждённых данных),
            // дальнейший избыток теряется. Избыток аггравированного теряется
            // всегда (персонаж уже мёртв).
            if (overflow > 0 && type !== "aggravated") {
                const freeNow = Math.max(0, MAXD - (b + l + a));
                const upg = Math.min(overflow, freeNow);
                if (type === "bashing") l += upg;
                else /* lethal */       a += upg;
            }
            // Финальная страховка от ухода за лимит (на случай «грязных» данных).
            if (b > MAXD) b = MAXD;
            if (l > MAXD) l = MAXD;
            if (a > MAXD) a = MAXD;
        } else {
            // ЛЕЧЕНИЕ: каждая кнопка лечит ТОЛЬКО свой тип урона.
            // Кнопки bashing лечат только bashing, lethal — только lethal,
            // aggravated — только aggravated. Никакого "перетекания" лечения
            // на другие типы (раньше из-за сквозного лечения кнопки башинга
            // могли вылечить агграву).
            let h = Math.abs(processValue);
            let hb = 0, hl = 0, ha = 0;
            if (type === "bashing")      { hb = Math.min(b, h); b -= hb; }
            else if (type === "lethal")  { hl = Math.min(l, h); l -= hl; }
            else if (type === "aggravated") { ha = Math.min(a, h); a -= ha; }
            bloodCost = (hl + ha) * 5; // летальный и аггравированный лечатся кровью (5 кр/ячейка)
            // Защита от ухода в минус (например, если в данных остались значения > 7
            // со старых версий модуля).
            b = Math.max(0, b); l = Math.max(0, l); a = Math.max(0, a);
        }
        let canUpdate = true;
        if (bloodCost > 0 && useBlood) {
            const curB = foundry.utils.getProperty(actor, CONFIG.bloodPath);
            if (curB !== undefined) {
                const bNum = Number(curB) || 0;
                if (bNum < bloodCost) { ui.notifications.warn(`${actor.name}: мало Крови!`); canUpdate = false; }
                else { await actor.update({ [CONFIG.bloodPath]: bNum - bloodCost }); totalBloodCost += bloodCost; }
            } else {
                ui.notifications.warn(`${actor.name}: нет поля Крови!`); canUpdate = false;
            }
        }
        if (canUpdate && (b !== current.bashing || l !== current.lethal || a !== current.aggravated)) {
            await actor.update({ [`${CONFIG.healthPath}.bashing`]: b, [`${CONFIG.healthPath}.lethal`]: l, [`${CONFIG.healthPath}.aggravated`]: a });
            updatedCount++;
        } else if (canUpdate && value < 0 && b === 0 && l === 0 && a === 0) {
            // Лечить нечего — шкала уже полна. Синее уведомление с кулдауном 3с.
            statusInfo(`health:${actor.name}`, `${actor.name} в полном порядке!`);
        }
    }
    // Сообщение в чат — только если состояние хотя бы одного актёра реально
    // изменилось (урон/лечение применены или списана Кровь). Раньше условие
    // `updatedCount > 0 || targets.length > 0` всегда давало true при выбранной
    // цели, и в чат падали ложные сообщения (например, «лечит урон», когда
    // лечение заблокировано нехваткой Крови).
    if (updatedCount > 0 || totalBloodCost > 0) {
        let validTargets = targets.filter(Boolean);
        let targetName = validTargets.map(t => t.name).join(', ');
        let bloodText = totalBloodCost > 0 ? ` (потрачено ${totalBloodCost} Крови)` : "";
        let actionText = (value > 0 || value === "damage") ? "получает" : "лечит";

        let chatData = { speaker: ChatMessage.getSpeaker(), content: `<p><strong>${escapeHtml(targetName)}</strong> ${actionText} урон (${namesMap[type]})${bloodText}.</p>` };

        let whisperTargets = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (!game.user.isGM) whisperTargets.push(game.user.id);
        chatData.whisper = whisperTargets;

        ChatMessage.create(chatData);
    }
}

async function processResourceAction(html, type, value, npcId, players) {
    let targets = [];
    if (npcId) { targets = [game.actors.get(npcId)]; } else {
        const activeBtns = html.find('.wod-tab-content.active .wod-actor-btn.active');
        if (activeBtns.length === 0 && game.user.character) {
            targets = [game.user.character];
        } else if (activeBtns.length === 0) {
            return ui.notifications.warn("Выберите персонажа!");
        } else if (html.find('.wod-actor-btn[data-id="ALL"].active').length > 0) {
            targets = players;
        } else {
            activeBtns.each(function() { targets.push(game.actors.get($(this).data('id'))); });
        }
    }
    const paths = {
        blood: { path: CONFIG.bloodPath, max: CONFIG.bloodMax, name: "Кровь" },
        will: { path: CONFIG.willPath, max: CONFIG.willPerm, name: "Волю" }
    };
    const config = paths[type];
    let updatedCount = 0;
    let messageParts = [];

    for (const actor of targets) {
        if (!actor) continue;
        const rawValue = foundry.utils.getProperty(actor, config.path);
        if (rawValue === undefined || rawValue === null) {
            ui.notifications.warn(`${actor.name}: нет ресурса (${config.name})!`);
            continue;
        }
        const current = Number(rawValue) || 0;

        const max = Number(foundry.utils.getProperty(actor, config.max)) || 10;

        let newValue = current + value;
        if (value === "damage") newValue = 0;
        else if (value === "heal") newValue = max;

        if (newValue < 0) newValue = 0;
        if (newValue > max) newValue = max;

        // В чат идёт только реально изменившееся значение (без noop-строк).
        if (newValue !== current) {
            await actor.update({ [config.path]: newValue });
            updatedCount++;
            let actionText = (value === "damage") ? "опустошена" : ((value === "heal") ? "восстановлена" : "");
            messageParts.push(`<strong>${escapeHtml(actor.name)}</strong> (${config.name} ${actionText} -> Остаток: ${newValue})`);
        } else if (newValue === max && max > 0) {
            // Ресурс уже полон — синее уведомление с кулдауном 3с.
            const msg = (type === "blood") ? "Кровь до краёв!" : "Воля крепка как скала!";
            statusInfo(`${type}:${actor.name}`, `${actor.name}: ${msg}`);
        }
    }

    if (updatedCount > 0) {
        let chatData = {
            speaker: ChatMessage.getSpeaker(),
            content: `<p>${messageParts.join('<br>')}</p>`
        };

        let whisperTargets = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (!game.user.isGM) whisperTargets.push(game.user.id);
        chatData.whisper = whisperTargets;

        ChatMessage.create(chatData);
    }
}

async function executeDiscipline(html) {
    const isGM = game.user.isGM;
    let actorId = isGM ? html.find('#disc-npc-select').val() : html.find('#disc-actor-select').val();
    if (!actorId && isGM) actorId = game.actors.contents.find(a => a.items.some(i => i.type === "Power" && i.system.level > 0))?.id;
    if (!actorId) return ui.notifications.error("Выберите персонажа!");

    const actor = game.actors.get(actorId);
    const powerId = html.find('#disc-power-select').val();
    const power = actor.items.get(powerId); if (!power) return;

    const customDifficulty = Number(html.find('#disc-difficulty').val()) || 6;
    const useSpeciality = html.find('#disc-use-spec').is(':checked');
    const useWillpower = html.find('#disc-use-will').is(':checked');
    const isBlind = html.find('#disc-blind-roll').is(':checked');
    const manualBonus = Number(html.find('#disc-manual-bonus').val()) || 0;
    // --- ЧИТАЕМ ЧЕКБОКС ИГНОРИРОВАНИЯ ШТРАФОВ ---
    const ignoreWounds = html.find('#disc-ignore-wounds').is(':checked');

    const inputBloodX = html.find('#input-blood-x'); const inputWillX = html.find('#input-will-x');
    let finalBlood = 0, finalWill = 0;

    const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
    const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
    const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

    if (power.system.spendblood === true && !bloodMatch) finalBlood = 1;
    else if (bloodMatch) { if (bloodMatch[1].toLowerCase() === "x" && inputBloodX.length) finalBlood = parseInt(inputBloodX.val()) || 1; else finalBlood = parseInt(bloodMatch[1]); }
    if (willMatch) { if (willMatch[1].toLowerCase() === "x" && inputWillX.length) finalWill = parseInt(inputWillX.val()) || 1; else finalWill = parseInt(willMatch[1]); }
    if (useWillpower) finalWill += 1;

    if (finalBlood > 0) {
        const perTurn = Number(foundry.utils.getProperty(actor, CONFIG.bloodPerTurn)) || 1;
        if (finalBlood > perTurn) {
            const confirm = await new Promise(resolve => {
                new Dialog({
                    title: "Превышение лимита Крови",
                    content: `<p>Сила требует <strong>${finalBlood}</strong> Крови, но лимит вашего поколения — <strong>${perTurn}</strong> за ход.</p><p>Разрешить исключение?</p>`,
                    buttons: {
                        yes: { label: "Да, потратить", callback: () => resolve(true) },
                        no: { label: "Отмена", callback: () => resolve(false) }
                    },
                    default: "no",
                    close: () => resolve(false)
                }).render(true);
            });
            if (!confirm) return;
        }
    }

    let resourceHTML = "";
    if (finalBlood > 0) {
        const curB = Number(foundry.utils.getProperty(actor, CONFIG.bloodPath));
        if (isNaN(curB)) return ui.notifications.error(`${actor.name}: нет пула Крови!`);
        if (curB < finalBlood) return ui.notifications.error(`${actor.name}: мало Крови!`);
        await actor.update({ [CONFIG.bloodPath]: curB - finalBlood });
        resourceHTML += `<p style="color: #8b0000; margin: 2px 0;"><em>Потрачено ${finalBlood} Крови (осталось ${curB - finalBlood}).</em></p>`;
    }
    if (finalWill > 0) {
        const curW = Number(foundry.utils.getProperty(actor, CONFIG.willPath));
        if (isNaN(curW)) return ui.notifications.error(`${actor.name}: нет пула Воли!`);
        if (curW < finalWill) return ui.notifications.error(`${actor.name}: мало Воли!`);
        await actor.update({ [CONFIG.willPath]: curW - finalWill });
        resourceHTML += `<p style="color: #00008b; margin: 2px 0;"><em>Потрачено ${finalWill} Воли (осталось ${curW - finalWill}).</em></p>`;
    }

    let rollHTML = "";
    let roll = null;

    if (power.system.dice1) {
        const attrKey = power.system.dice1, skillKey = power.system.dice2;
        let attrValue = attrKey === "willpower" ? (Number(foundry.utils.getProperty(actor, CONFIG.willPerm)) || 0) : (Number(foundry.utils.getProperty(actor, `system.attributes.${attrKey}.total`)) || 0);
        let skillValue = skillKey ? (Number(foundry.utils.getProperty(actor, `system.abilities.${skillKey}.value`)) || 0) : 0;

        // --- ШТРАФ ОТ РАН (состояние берется из системы Foundry) ---
        const wound = getWoundInfo(actor);
        if (!ignoreWounds && wound.dying) {
            ui.notifications.error(`${actor.name}: без сознания — бросать кубики нельзя!`);
            return;
        }
        const woundPenalty = (!ignoreWounds && !wound.dying) ? wound.penalty : 0;

        const pool = Math.max(0, attrValue + skillValue + manualBonus + woundPenalty);

        if (pool > 0) {
            roll = new Roll(`${pool}d10`);
            await roll.evaluate();

            if (game.dice3d && !isBlind) {
                await game.dice3d.showForRoll(roll, game.user, true, null, false);
            }

            let succ = 0, ones = 0;
            let diceHTML = "";
            for (let die of roll.dice[0].results) {
                let resType = 'neutral';
                if (die.result >= customDifficulty) {
                    succ += (die.result === 10 && useSpeciality) ? 2 : 1;
                    resType = (die.result === 10 && useSpeciality) ? 'spec' : 'success';
                }
                if (die.result === 1) {
                    ones++;
                    resType = 'fail';
                }
                diceHTML += createDiceHTML(die.result, resType);
            }

            let netFromDice = Math.max(0, succ - ones);
            let net = netFromDice;
            let resultTextHTML = "";

            if (useWillpower) {
                net += 1;
                if (netFromDice === 0) {
                    resultTextHTML = `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #2e6b4e;">Успехи: ${net}</div>
                                      <div style="margin-top: 4px; font-size: 0.9em; font-style: italic; color: #00008b;">Лишь сильная воля помогает преодолеть трудности!</div>`;
                } else {
                    resultTextHTML = `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #2e6b4e;">Успехи: ${net} <span style="font-size: 0.8em; color: #00008b;">(включая +1 от Воли)</span></div>`;
                }
            } else {
                if (succ === 0 && ones > 0) {
                    resultTextHTML = `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #d32f2f;">ПРОВАЛ</div>`;
                } else if (net === 0) {
                    resultTextHTML = `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #7f8c8d;">НЕУДАЧА</div>`;
                } else {
                    resultTextHTML = `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #2e6b4e;">Успехи: ${net}</div>`;
                }
            }

            rollHTML = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; text-align: center;">
                    <div style="margin-bottom: 5px;">Пул: <strong>${pool}d10</strong> (Сложность: ${customDifficulty})</div>
                    <div style="line-height: 1;">${diceHTML}</div>
                    ${resultTextHTML}
                </div>
            `;
        }
    } else {
        rollHTML = `<div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; text-align: center; font-style: italic; color: #555;">Эта сила не требует броска.</div>`;
    }

    let chatData = {
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
            <div style="font-family: 'Signika', sans-serif;">
                <h3 style="margin-top: 0; margin-bottom: 5px; border-bottom: 2px solid #8b0000; padding-bottom: 3px;">${escapeHtml(power.name)}</h3>
                ${resourceHTML}
                <div style="margin-top: 10px; font-size: 0.9em; border-top: 1px solid #ccc; padding-top: 5px;">
                    ${power.system.description || ""}
                    ${power.system.details || ""}
                </div>
                ${rollHTML}
            </div>
        `
    };

    if (isBlind) {
        chatData.blind = true;
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (roll) chatData.rolls = [roll];
    }

    ChatMessage.create(chatData);
}

Hooks.on("ready", () => {
    if (document.getElementById("wod-radial-menu")) return;

    const container = document.createElement("div");
    container.id = "wod-radial-menu";

    const MENU_W = 120, MENU_H = 120;
    // Ограничение позиции меню пределами окна (актуально при смене монитора/размера).
    const clampPos = (left, top) => ({
        left: Math.max(0, Math.min(left, window.innerWidth - MENU_W)),
        top: Math.max(0, Math.min(top, window.innerHeight - MENU_H))
    });

    const savedPos = localStorage.getItem("wod-radial-menu-pos");
    let initLeft = 50, initTop = Math.round(window.innerHeight * 0.45);
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            const c = clampPos(Number(pos.left) || 0, Number(pos.top) || 0);
            initLeft = c.left; initTop = c.top;
        } catch (e) { /* используем позицию по умолчанию */ }
    }
    container.style.cssText = `position: fixed; top: ${initTop}px; left: ${initLeft}px; width: ${MENU_W}px; height: ${MENU_H}px; z-index: 10; pointer-events: none;`;

    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialX, initialY;

    function createIcon(icon, title, tabName, top, left) {
        const btn = document.createElement("div");
        btn.className = "wod-single-icon";
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.title = title;
        btn.style.cssText = `
            position: absolute; top: ${top}px; left: ${left}px;
            width: 45px; height: 45px; background: #10b981; color: white;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            border: 2px solid #34d399; transition: all 0.2s ease;
            z-index: 2; pointer-events: auto;
        `;
        btn.onmouseenter = () => { btn.style.transform = "scale(1.2)"; btn.style.background = "#059669"; };
        btn.onmouseleave = () => { btn.style.transform = "scale(1)"; btn.style.background = "#10b981"; };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!hasMoved) {
                openMainPanel(tabName);
            }
        });
        return btn;
    }

    container.appendChild(createIcon("fa-heart", "Здоровье", "tab-health", 0, 37));
    container.appendChild(createIcon("fa-tint", "Ресурсы", "tab-resources", 65, 0));
    container.appendChild(createIcon("fa-book", "Дисциплины", "tab-disciplines", 65, 75));

    document.body.appendChild(container);

    container.addEventListener("mousedown", (e) => {
        if (!e.target.closest('.wod-single-icon')) return;
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        initialX = container.offsetLeft;
        initialY = container.offsetTop;
        container.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            hasMoved = true;
            e.preventDefault();
            const c = clampPos(initialX + dx, initialY + dy);
            container.style.left = `${c.left}px`;
            container.style.top = `${c.top}px`;
            container.style.bottom = "auto";
            container.style.right = "auto";
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = "grab";
            if (hasMoved) {
                localStorage.setItem("wod-radial-menu-pos", JSON.stringify({
                    top: container.offsetTop,
                    left: container.offsetLeft
                }));
            }
        }
    });
});
