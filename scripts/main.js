// ==========================================
// МОДУЛЬ: WoD Master Panel
// Файл: scripts/main.js (Версия 3.1 - единая суммирующаяся шкала на 7 ячеек:
// все типы урона занимают общие ячейки; новый тип заполняет только свободные
// ячейки и не может вытеснить уже нанесённый урон; при переполнении избыток
// повышается по тяжести: дробящий -> летальный, летальный -> аггравированный,
// а если повышать дальше некуда — избыток аггравированного теряется).
// ВЕРСИЯ 3.1: слит с модулем wod-firearms-test (стрельба) — логика ран общая
// (материнская панель первична), стрельба стала вкладкой «Огонь» основного
// пульта, ромбовидное меню получило четвёртую кнопку.
// Релизная версия модуля: 2.0.6 (см. module.json и Changelog в README.md).
// ==========================================

const MODULE_ID = "wod-master-panel";

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

// Режимы стрельбы (унаследовано из wod-firearms-test)
const FIRE_MODES = {
    single: { label: "Одиночный", cost: 1, bonus: 0, diffMod: 0, isBurst: false },
    short:  { label: "Короткая очередь", cost: 3, bonus: 2, diffMod: 1, isBurst: true },
    long:   { label: "Длинная очередь", cost: "ALL", bonus: 10, diffMod: 2, isBurst: true }
};

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

// ==========================================
// АУДИТОРИЯ СООБЩЕНИЙ В ЧАТЕ (v2.0.5, пункт 2 ТЗ)
//   • Игрок действует со своего пульта (ресурсы/здоровье своего персонажа) —
//     сообщение видят он и мастер.
//   • Мастер действует с панели игрока — аналогично: мастер и игрок-владелец.
//   • Мастер работает с ресурсами неписей — видит только мастер.
// Исправление v2.0.5: старая проверка `Array.isArray(actor.getOwnerUserIDs)`
// всегда давала false (это метод, а не массив), из-за чего владелец актёра НЕ
// попадал в список получателей шёпота — игрок не видел собственные трат Крови,
// Воли и изменения здоровья. Плюс серверная сборка 2.0.5 использовала удалённый
// в Foundry V13+ API CONST.ENTITY_PERMISSIONS, что роняло обработку здоровья
// (TypeError: can't access property "OWNER" ...). Теперь владельцы определяются
// через actor.owners / testUserPermission — оба способа совместимы с V13/V14.
// ==========================================
function getActorOwnerUserIds(actor) {
    const ids = new Set();
    if (!actor) return [];
    try {
        // Основной способ: список пользователей-владельцев актёра (V10+).
        if (typeof actor.owners !== "undefined" && actor.owners) {
            for (const u of actor.owners) if (u?.id) ids.add(u.id);
        } else if (typeof actor.testUserPermission === "function") {
            // Фолбэк, если actor.owners недоступен: явная проверка прав на каждого
            // пользователя. Используется testUserPermission (стабилен в V10–V14),
            // а не CONST.* — константы разрешений в разных сборках Foundry
            // переименовывались и это роняло пульт с ошибкой вида
            // "can't access property \"OWNER\" ... is undefined".
            for (const u of game.users.contents) {
                if (actor.testUserPermission(u, "OWNER")) ids.add(u.id);
            }
        }
    } catch (e) {
        console.warn("WoD Panel | не удалось получить владельцев актёра:", e);
    }
    return [...ids];
}

function buildResourceAudience(actor, isBlind = false) {
    // Базовая аудитория — мастера.
    const whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    // Скрытый бросок: результат видит ТОЛЬКО мастер (автор — нет, в этом смысл скрытности).
    if (isBlind) return { whisper, blind: true };
    // Если действие выполняет не мастер — он должен видеть собственное сообщение.
    if (!game.user.isGM && !whisper.includes(game.user.id)) whisper.push(game.user.id);
    // Добавляем владельца актёра (если это НПЦ, у которого нет игрока-владельца,
    // список пуст — сообщение увидит только мастер, как требует пункт 2 ТЗ).
    if (actor) {
        for (const uid of getActorOwnerUserIds(actor)) {
            if (!whisper.includes(uid)) whisper.push(uid);
        }
    }
    return { whisper, blind: false };
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
    const template = await renderTemplate(`modules/${MODULE_ID}/templates/panel.html`, {});

    const dialog = new Dialog({
        title: "WoD Master Panel",
        content: template,
        buttons: {
            close: { label: "Закрыть" }
        },
        render: (html) => {
            setupPanelLogic(html, isGM);
            setupFirearmsLogic(html, isGM);

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
        // Пункт 3 ТЗ (v2.0.5): сохранение выбора специализации. Раньше чекбокс
        // принудительно сбрасывался при каждой перерисовке блока (смена сложности,
        // галки «игнорировать штрафы» и т.п.) — пользователь ставил галку, она
        // исчезала, и бросок уходил без двойных десятков. Теперь состояние
        // сохраняется: сброс только при смене силы или персонажа.
        let specAvailable = false;
        if (skillKey) {
            const skill = foundry.utils.getProperty(actor, `system.abilities.${skillKey}`);
            specAvailable = !!(skill && skill.speciality && skill.speciality.trim() !== "");
            if (specAvailable) {
                html.find('#disc-spec-name').text(skill.speciality); html.find('#disc-spec-block').show();
            } else { html.find('#disc-spec-block').hide(); }
        } else { html.find('#disc-spec-block').hide(); }
        if (!specAvailable) html.find('#disc-use-spec').prop('checked', false);
        updateFinalDiscCost(actor, power);
    };

    // Сброс чекбокса специализации — только при реальной смене силы/персонажа
    // (updatePowerDetails вызывается из обработчиков change селекта силы ниже).
    const resetSpecialityCheckbox = () => html.find('#disc-use-spec').prop('checked', false);

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

    if (isGM) html.find('#disc-npc-select').change(() => { resetSpecialityCheckbox(); updateDiscUI(); });
    else html.find('#disc-actor-select').change(() => { resetSpecialityCheckbox(); updateDiscUI(); });
    html.find('#disc-power-select').change(() => { resetSpecialityCheckbox(); updatePowerDetails(); });
    // Пункт 3 ТЗ: чекбокс специализации больше не «живёт» без обработчика —
    // галка остаётся установленной до броска (сброс только при смене силы/персонажа).
    html.find('#disc-use-spec').change(function() {
        $(this).prop('checked', $(this).is(':checked'));
    });
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
    // Запоминаем суммарный урон каждой цели ДО изменения — чтобы написать в
    // чате реальное количество нанесённого/вылеченного урона (п.1).
    const prevDamage = {};
    for (const actor of targets) {
        if (!actor) continue;
        const cur = foundry.utils.getProperty(actor, CONFIG.healthPath);
        if (!cur) continue;
        prevDamage[actor.id] = (Number(cur.bashing) || 0) + (Number(cur.lethal) || 0) + (Number(cur.aggravated) || 0);
    }

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
            // Пункт 1 ТЗ (стоимость лечения Кровью, как в родительских версиях):
            //   • дробящий (bashing)    — бесплатно;
            //   • летальный (lethal)    — 1 Кровь за ячейку;
            //   • аггравированный (agg.)— 5 Кровей за ячейку.
            bloodCost = hl * 1 + ha * 5;
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
        } else if (bloodCost > 0 && !useBlood) {
            // Исправление v2.0.6: раньше при снятой галке «Тратить Кровь на
            // лечение» списание крови молча пропускалось, но в чат уходило
            // сообщение с реальными дельтами — казалось, что лечил бесплатно.
            // Теперь лечение без затрат Крови невозможно: действие блокируется.
            ui.notifications.warn(`${actor.name}: включите «Тратить Кровь на лечение» — лечение без затрат Крови невозможно.`);
            canUpdate = false;
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

        // Количество реально изменённого урона (сумма дельт по всем целям):
        // при нанесении — сколько ячеек реально заполнено, при лечении —
        // сколько реально снято.
        let changedAmount = 0;
        for (const actor of targets) {
            if (!actor) continue;
            const cur = foundry.utils.getProperty(actor, CONFIG.healthPath);
            if (!cur) continue;
            const sum = (Number(cur.bashing) || 0) + (Number(cur.lethal) || 0) + (Number(cur.aggravated) || 0);
            changedAmount += Math.abs(sum - (Number(prevDamage[actor.id]) || 0));
        }

        let chatData = { speaker: ChatMessage.getSpeaker(), content: `<p><strong>${escapeHtml(targetName)}</strong> ${actionText} урон ${changedAmount} (${namesMap[type]})${bloodText}.</p>` };

        // Пункт 2 ТЗ: игрок и мастер (владелец актёра) видят сообщение,
        // при работе мастера с неписями — только мастера.
        const audience = buildResourceAudience(targets.filter(Boolean)[0]);
        chatData.whisper = audience.whisper;

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
            // Явно указываем дельту ресурса (+/-N) и остаток.
            const deltaStr = (value === "damage") ? `−${current}` : (value === "heal") ? `+${max - current}` : (newValue > current ? `+${value}` : `${value}`);
            messageParts.push(`<strong>${escapeHtml(actor.name)}</strong>: ${config.name} ${deltaStr} → Остаток: ${newValue}${actionText ? ` (${actionText})` : ""}`);
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

        // Пункт 2 ТЗ: траты/восстановление Крови и Воли видят игрок-владелец
        // и мастер; при работе мастера с неписями — только мастер.
        const audience = buildResourceAudience(targets.filter(Boolean)[0]);
        chatData.whisper = audience.whisper;

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
    const useSpeciality = html.find('#disc-use-spec').is(':checked') && (() => {
        // Пункт 3 ТЗ (v2.0.6): галка «Специализация» больше не может заблокировать
        // дисциплину. Если у выбранного навыка нет заполненной speciality, галка
        // снимается в момент броска и бросок проходит как обычный (без двойных
        // десятков), а не прерывается с ошибкой.
        const sk = power.system.dice2;
        const sf = sk ? foundry.utils.getProperty(actor, `system.abilities.${sk}.speciality`) : "";
        if (!sf || String(sf).trim() === "") {
            html.find('#disc-use-spec').prop('checked', false);
            return false;
        }
        return true;
    })();
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
    // Пункт 2/4 ТЗ (v2.0.5): трата ресурсов (Кровь/Воля) видна игроку-владельцу
    // и мастеру; при работе мастера с неписями — только мастеру. Исправлен баг:
    // старая проверка Array.isArray(actor.getOwnerUserIDs) всегда давала false,
    // из-за чего владелец не получал сообщение, а при нулевой Воле дисциплина
    // блокировалась ещё до списания.
    let resourceAudience = null;
    if (finalBlood > 0 || finalWill > 0) {
        resourceAudience = buildResourceAudience(actor, isBlind);
    }
    if (finalBlood > 0) {
        const curB = Number(foundry.utils.getProperty(actor, CONFIG.bloodPath));
        if (isNaN(curB)) return ui.notifications.error(`${actor.name}: нет пула Крови!`);
        if (curB < finalBlood) return ui.notifications.error(`${actor.name}: мало Крови!`);
        await actor.update({ [CONFIG.bloodPath]: curB - finalBlood });
        // Формат родителя (tessst): «Потрачено N Крови (осталось M).»
        resourceHTML += `<p style="color: #8b0000; margin: 2px 0;"><em>Потрачено ${finalBlood} Крови (осталось ${curB - finalBlood}).</em></p>`;
    }
    if (finalWill > 0) {
        const curW = Number(foundry.utils.getProperty(actor, CONFIG.willPath));
        if (isNaN(curW)) return ui.notifications.error(`${actor.name}: нет пула Воли!`);
        if (curW < finalWill) return ui.notifications.error(`${actor.name}: мало Воли!`);
        await actor.update({ [CONFIG.willPath]: curW - finalWill });
        // Формат родителя (tessst): «Потрачено N Воли (осталось M).»
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

        // Пункт 3 ТЗ (v2.0.5): если специализация реально не применима (у навыка
        // нет заполненного поля speciality), галка игнорируется — бросок проходит
        // как обычный, а не блокируется и не даёт ложных «двойных десятков».
        const specField = skillKey ? foundry.utils.getProperty(actor, `system.abilities.${skillKey}.speciality`) : "";
        const effectiveSpeciality = useSpeciality && !!(specField && String(specField).trim() !== "");

        if (pool > 0) {
            roll = new Roll(`${pool}d10`);
            await roll.evaluate();

            // Кубы Dice3D летят ВСЕГДА (исправление: при скрытном броске кубы не пропадали).
            // При скрытном броске кубы скрыты ото всех, кроме мастера (GM):
            // whisper = список ГМ, hide = true (кидающий-игрок кубов не видит).
            const discWhisperIds = isBlind ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined;
            if (game.dice3d) {
                await game.dice3d.showForRoll(roll, game.user, true, discWhisperIds, isBlind);
            }

            let succ = 0, ones = 0;
            let diceHTML = "";
            for (let die of roll.dice[0].results) {
                let resType = 'neutral';
                if (die.result >= customDifficulty) {
                    succ += (die.result === 10 && effectiveSpeciality) ? 2 : 1;
                    resType = (die.result === 10 && effectiveSpeciality) ? 'spec' : 'success';
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
                // Столовое правило этого модуля: потраченная Воля — это ВСЕГДА
                // +1 успех, независимо от результата кубов.
                net += 1;
                // Надпись про сильную волю: если успех появился лишь благодаря Воли
                // (кубы сами по себе не дали ничего) — как в тестовом модуле (п.6).
                resultTextHTML = (netFromDice === 0)
                    ? `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #2e6b4e;">Успехи: ${net}</div>
                                      <div style="margin-top: 4px; font-size: 0.9em; font-style: italic; color: #00008b;">Лишь сильная воля помогает преодолеть трудности!</div>`
                    : `<div style="margin-top: 8px; font-size: 1.2em; font-weight: bold; color: #2e6b4e;">Успехи: ${net} <span style="font-size: 0.8em; color: #00008b;">(включая +1 от Воли)</span></div>`;
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
                    <div style="margin-bottom: 5px;">Пул: <strong>${attrKey} (${attrValue}) + ${skillKey || "—"} (${skillValue})${manualBonus ? `${manualBonus > 0 ? ' +' : ' '}(${manualBonus}) ручн.` : ""}${woundPenalty ? ` Штраф ран (${woundPenalty})` : ""} = ${pool}</strong> (Сложность: ${customDifficulty})</div>
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
        // Скрытный бросок: результат видит ТОЛЬКО GM (автор — нет, в этом смысл скрытности).
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        if (roll) chatData.rolls = [roll];
    } else if (resourceAudience && resourceHTML) {
        // Пункт 2/4 ТЗ (v2.0.5): строки «Потрачено N ... (осталось M)» видят
        // игрок-владелец и мастера (для неписей — только мастер). Исправлен баг
        // getOwnerUserIDs — теперь владелец гарантированно получает сообщение.
        chatData.whisper = resourceAudience.whisper;
    }

    ChatMessage.create(chatData);
}

// ==========================================
// СТРЕЛЬБА (унаследовано из wod-firearms-test v1.4.0)
// Логика ран — общая, из материнского модуля (getWoundInfo/WOUND_PENALTIES).
// Панель стрельбы — вкладка «Огонь» основного пульта; отдельной плавающей
// кнопки больше нет. Воля списывается через CONFIG.willPath (как в панели).
// ==========================================

function setupFirearmsLogic(html, isGM) {
    const tab = html.find('#tab-firearms');
    if (!tab.length) return;

    // --- Список персонажей для стрельбы ---
    if (isGM) {
        let npcOptions = `<option value="">Не выбрано</option>`;
        game.actors.filter(a => a.type === "Vampire" || a.type === "Mortal")
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(n => npcOptions += `<option value="${n.id}">${escapeHtml(n.name)}</option>`);
        tab.find('#fire-npc-select').html(npcOptions);
        tab.find('#fire-npc-block').show();
        tab.find('#fire-actor-block').hide();
    } else {
        const actor = game.user.character;
        tab.find('#fire-actor-block').show().find('label').hide();
        if (actor) tab.find('#fire-actor-select').html(`<option value="${actor.id}">${escapeHtml(actor.name)}</option>`);
    }

    // --- Кнопки сложности (3..10), как во вкладке Дисциплин ---
    const fireDiffContainer = tab.find('#fire-difficulty-buttons');
    const fireDiffInput = tab.find('#fire-difficulty');
    const renderFireDifficultyButtons = (currentDiff) => {
        fireDiffContainer.empty();
        for (let i = 3; i <= 10; i++) {
            const isActive = i === currentDiff;
            const btn = $(`<button type="button" class="wod-diff-btn ${isActive ? 'active' : ''}" data-val="${i}">${i}</button>`);
            btn.click(function() {
                const val = $(this).data('val');
                fireDiffInput.val(val);
                renderFireDifficultyButtons(val);
            });
            fireDiffContainer.append(btn);
        }
    };
    renderFireDifficultyButtons(6);

    const getActor = () => {
        const actorId = isGM ? tab.find('#fire-npc-select').val() : (game.user.character?.id || tab.find('#fire-actor-select').val());
        return game.actors.get(actorId);
    };

    const updateAmmoInfo = (weapon) => {
        if (!weapon) return tab.find('#fire-ammo-info').text("В магазине: 0 / 0");
        const clip = weapon.system.clip || { value: 0, max: 0 };
        tab.find('#fire-ammo-info').text(`В магазине: ${clip.value} / ${clip.max}`);
    };

    const renderModeButtons = (weapon) => {
        const container = tab.find('#fire-mode-buttons');
        container.empty();
        if (!weapon) return;

        const modeObj = weapon.system.mode || {};
        const hasBurst = modeObj.hasburst || false;
        const hasFullAuto = modeObj.hasfullauto || false;
        const weaponDiff = parseInt(weapon.system.difficulty || 6);

        Object.entries(FIRE_MODES).forEach(([key, mode]) => {
            const isDisabled = (key === "short" && !hasBurst) || (key === "long" && !hasFullAuto);
            const btn = $(`<button type="button" class="wod-mode-btn ${key === 'single' ? 'active' : ''}" data-mode="${key}" ${isDisabled ? 'disabled' : ''}>${mode.label}</button>`);
            btn.click(function() {
                if ($(this).prop('disabled')) return;
                container.find('.wod-mode-btn').removeClass('active');
                $(this).addClass('active');
                renderFireDifficultyButtons(weaponDiff + mode.diffMod);
            });
            container.append(btn);
        });
    };

    const updateWeapons = () => {
        const actor = getActor();
        if (!actor) {
            tab.find('#fire-weapon-select').html(`<option value="">Не выбрано</option>`);
            tab.find('#fire-mode-buttons').empty();
            tab.find('#fire-ammo-info').text("В магазине: 0 / 0");
            return;
        }
        const weapons = actor.items.filter(i => i.type === "Ranged Weapon");
        let options = `<option value="">Не выбрано</option>`;
        weapons.forEach(w => options += `<option value="${w.id}">${escapeHtml(w.name)}</option>`);
        tab.find('#fire-weapon-select').html(options);
        tab.find('#fire-mode-buttons').empty();
        updateAmmoInfo(null);
    };

    if (isGM) tab.find('#fire-npc-select').change(updateWeapons);
    else tab.find('#fire-actor-select').change(updateWeapons);

    tab.find('#fire-weapon-select').change(function() {
        const actor = getActor();
        const weapon = actor?.items.get($(this).val());
        updateAmmoInfo(weapon);
        renderModeButtons(weapon);
    });

    tab.find('.fire-dmg-type-btn').click(function() {
        tab.find('.fire-dmg-type-btn').removeClass('active').css({ background: '', color: '' });
        $(this).addClass('active').css({ background: '#2c6b81', color: 'white' });
    });

    tab.find('#fire-btn').off('click').on('click', () => {
        safeRun("выстрел", () => executeFirearmAttack(tab, getActor));
    });

    updateWeapons();
}

async function executeFirearmAttack(tab, getActor) {
    const isGM = game.user.isGM;
    const actor = getActor();
    if (!actor) return ui.notifications.error("Выберите персонажа!");
    const weapon = actor.items.get(tab.find('#fire-weapon-select').val());
    if (!weapon) return ui.notifications.error("Выберите оружие!");

    const mode = tab.find('.wod-mode-btn.active').data('mode') || "single";
    const config = FIRE_MODES[mode];
    const clip = weapon.system.clip || { value: 0, max: 0 };

    if (mode === "long" && clip.value <= clip.max / 2) return ui.notifications.error("Слишком мало патронов для длинной очереди!");
    if (mode !== "long" && clip.value < config.cost) return ui.notifications.error("Недостаточно патронов!");

    const useWill = tab.find('#fire-use-will').is(':checked');
    const isBlind = tab.find('#fire-blind-roll').is(':checked');
    const ignoreWounds = tab.find('#fire-ignore-wounds').is(':checked');
    const manualBonus = Number(tab.find('#fire-manual-bonus').val()) || 0;
    const finalDiff = Number(tab.find('#fire-difficulty').val()) || 6;
    const damageType = tab.find('.fire-dmg-type-btn.active').data('val') || "lethal";

    // --- ПРОВЕРКА ВОЛИ (путь берётся из CONFIG, как во всём пульте) ---
    if (useWill) {
        const curWP = Number(foundry.utils.getProperty(actor, CONFIG.willPath)) || 0;
        if (curWP <= 0) return ui.notifications.error(`${actor.name}: недостаточно Воли!`);
    }

    const attrKey = weapon.system.attack?.attribute || "dexterity";
    const abilityKey = weapon.system.attack?.ability || "firearms";
    const attrObj = actor.system.attributes?.[attrKey] || {};
    const attrVal = attrObj.total ?? attrObj.value ?? 0;
    const abilityVal = actor.system.abilities?.[abilityKey]?.value || 0;
    const accuracy = weapon.system.attack?.accuracy || 0;
    // Специализация в стрельбу пока НЕ добавляется (по согласованию, v1.4.4).
    // Убрано чтение speciality у оружия: из-за него десятки становились золотыми,
    // хотя специализации на стрельбе нет.

    // --- ШТРАФ ОТ РАН: единая логика материнской панели (v1.3.6+) ---
    const wound = getWoundInfo(actor);
    let woundPenalty = 0;
    let woundStateName = wound.stateName;
    if (!ignoreWounds) {
        // При смерти бросок невозможен — блокируем действие и сообщаем в чат.
        if (wound.dying) {
            const incapData = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escapeHtml(actor.name)}</strong> находится при смерти (${woundStateName}) и не может совершать действия.</p>` };
            return ChatMessage.create(incapData);
        }
        woundPenalty = wound.penalty;
    }

    const basePool = attrVal + abilityVal + accuracy + config.bonus + woundPenalty;
    const finalPool = Math.max(0, Math.floor(basePool + manualBonus));

    if (finalPool <= 0) {
        const failData = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escapeHtml(actor.name)}</strong> пытается выстрелить из ${escapeHtml(weapon.name)}, но пул кубов равен 0${ignoreWounds ? '' : ` (Штраф от ран: ${woundPenalty})`}. Действие провалено.</p>` };
        if (isBlind) { failData.blind = true; failData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id); }
        return ChatMessage.create(failData);
    }

    const newClipValue = Math.max(0, clip.value - (config.cost === "ALL" ? clip.value : config.cost));
    await weapon.update({ "system.clip.value": newClipValue });

    const roll = new Roll(`${finalPool}d10`);
    await roll.evaluate();
    // Кубы Dice3D летят ВСЕГДА, в том числе при скрытном броске
    // (show() молча возвращает false для blind-сообщений — используем showForRoll напрямую).
    // При скрытном броске кубы скрыты ото всех, кроме мастера (GM).
    if (game.dice3d) {
        const fireWhisperIds = isBlind ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined;
        await game.dice3d.showForRoll(roll, game.user, true, fireWhisperIds, isBlind);
    }

    let rawSucc = 0, ones = 0, diceHTML = "";
    for (const die of roll.dice[0].results) {
        const isSucc = die.result >= finalDiff;
        const isOne = die.result === 1;
        if (isSucc) rawSucc += 1;
        if (isOne) ones++;
        diceHTML += createDiceHTML(die.result, isSucc ? 'success' : (isOne ? 'fail' : 'neutral'));
    }

    let netSucc = Math.max(0, rawSucc - ones);
    let willText = "";
    // Пункт 2/4 ТЗ (v2.0.5): списание Воли за выстрел — видно игроку-владельцу
    // и мастерам; для неписей — только мастеру. Исправлен баг: старая проверка
    // Array.isArray(actor.getOwnerUserIDs) всегда давала false (это метод),
    // из-за чего игрок не видел ни карточку выстрела с тратой Воли, ни результат.
    let fireWillAudience = null;
    let willResourceHTML = "";

    if (useWill) {
        // Столовое правило этого модуля: Воля — это ВСЕГДА +1 успех,
        // независимо от результата кубов.
        const diceNet = netSucc; // итог кубов до Воли
        netSucc += 1;
        // Родительский вариант отображения (согласовано, п.D): строка про сильную
        // волю показывается при пустых кубах; пометки «(+1 успех)» нет.
        willText = (diceNet === 0)
            ? `<div style="margin-top: 4px; font-size: 0.9em; font-style: italic; color: #00008b;">Лишь сильная воля помогает преодолеть трудности!</div>`
            : "";
        const curWP = Number(foundry.utils.getProperty(actor, CONFIG.willPath)) || 0;
        await actor.update({ [CONFIG.willPath]: Math.max(0, curWP - 1) });
        // Пункт 4 ТЗ (v2.0.5): трата Воли при выстреле теперь видна в чате —
        // строка в родительском формате «Потрачено N Воли (осталось M)».
        willResourceHTML = `<p style="color: #00008b; margin: 2px 0;"><em>Потрачено 1 Воли (осталось ${Math.max(0, curWP - 1)}).</em></p>`;
        fireWillAudience = buildResourceAudience(actor, isBlind);
    }

    let resultText = "";
    if (rawSucc === 0 && ones > 0 && !useWill) resultText = `<div style="color: #d32f2f; font-weight: bold; margin-top: 5px;">ПРОВАЛ (Ботч)</div>`;
    else if (netSucc === 0) resultText = `<div style="color: #7f8c8d; font-weight: bold; margin-top: 5px;">ПРОМАХ</div>`;
    else resultText = `<div style="color: #2e6b4e; font-weight: bold; margin-top: 5px;">Успехи: ${netSucc}</div>`;

    const attackHtml = await renderTemplate(`modules/${MODULE_ID}/templates/chat-fire-attack.html`, {
        actorName: escapeHtml(actor.name),
        weaponName: escapeHtml(weapon.name),
        pool: `${attrKey} (${attrVal}) + ${abilityKey} (${abilityVal})${accuracy ? ` + Acc (${accuracy})` : ''}${config.bonus ? ` + Режим (${config.bonus})` : ''}${woundPenalty ? ` Штраф ран: ${woundStateName} (${woundPenalty})` : ''}${manualBonus ? ` + Вручную (${manualBonus})` : ''} = ${finalPool}`,
        difficulty: finalDiff,
        // Текст с расчётами убран — остаётся только строка под кубами (по согласованию).
        successesSummary: willResourceHTML,
        diceHTML: diceHTML + resultText + willText
    });

    const chatData = { speaker: ChatMessage.getSpeaker({ actor }), content: attackHtml };
    // Скрытный бросок: сообщение видит ТОЛЬКО GM (автор — нет, в этом смысл скрытности).
    if (isBlind) { chatData.blind = true; chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id); }
    else if (fireWillAudience) {
        // Пункт 2/4 ТЗ (v2.0.5): карточка со списанием Воли видна игроку-владельцу
        // и мастерам (для неписей — только мастеру). Исправлен баг getOwnerUserIDs.
        chatData.whisper = fireWillAudience.whisper;
    }
    await ChatMessage.create(chatData);

    // Пункт 8 (согласовано): при нулевых успехах атаки — отдельная строка в чате.
    if (netSucc <= 0) {
        const missShotData = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escapeHtml(actor.name)}</strong> промахивается.</p>` };
        if (isBlind) { missShotData.blind = true; missShotData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id); }
        await ChatMessage.create(missShotData);
    }

    if (netSucc > 0) {
        setTimeout(() => openDamageDialog(actor, weapon, netSucc, damageType, isBlind), 600);
    }
}

async function openDamageDialog(actor, weapon, attackSuccesses, damageType, isBlindAttack) {
    const baseDamage = weapon.system.damage?.bonus || 0;

    let diffBtnsHTML = "";
    for (let i = 3; i <= 10; i++) {
        diffBtnsHTML += `<button type="button" class="wod-diff-btn ${i === 6 ? 'active' : ''}" data-val="${i}">${i}</button>`;
    }

    const dialogContent = `
        <div style="font-family: 'Signika', sans-serif; padding: 5px;">
            <h3 style="margin-top: 0; color: #8b0000; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${escapeHtml(weapon.name)}</h3>

            <div style="margin-bottom: 10px; font-size: 0.95em;">
                <strong>Базовый урон:</strong> ${baseDamage} (${damageType})<br>
                <strong>Успехи атаки:</strong> ${attackSuccesses}
            </div>

            <div style="margin-bottom: 10px; padding: 8px; background: rgba(139,0,0,0.1); border-radius: 4px; border: 1px solid #ccc;">
                <label style="font-weight: bold; font-size: 13px; color: #8b0000;">Успехи защиты (Уклонение/Парирование):</label>
                <input type="number" class="wod-defense-succ" value="0" min="0" style="width: 100%; padding: 4px; border: 1px solid #999; border-radius: 4px; margin-top: 4px;">
            </div>

            <div style="margin-bottom: 10px;">
                <label style="font-weight: bold; font-size: 13px;">Сложность урона:</label>
                <div class="wod-dmg-diff-container" style="display: flex; gap: 4px; margin-top: 4px;">${diffBtnsHTML}</div>
                <input type="hidden" class="wod-dmg-diff-input" value="6">
            </div>

            <div style="margin-bottom: 10px;">
                <label style="font-weight: bold; font-size: 13px;">Бонус/Штраф кубов:</label>
                <input type="number" class="wod-dmg-manual-bonus" value="0" style="width: 100%; padding: 4px; border: 1px solid #999; border-radius: 4px; margin-top: 4px;">
            </div>

            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button type="button" class="wod-roll-dmg-btn" style="background: #8b0000; color: white; padding: 6px 15px; border: 1px solid #5c0000; cursor: pointer; font-weight: bold; border-radius:4px;">Бросок урона</button>
                <button type="button" class="wod-cancel-dmg-btn" style="background: #444; color: white; padding: 6px 15px; border: 1px solid #222; cursor: pointer; font-weight: bold; border-radius:4px;">Отмена</button>
            </div>
        </div>
    `;

    new Dialog({
        title: `${weapon.name}`,
        content: dialogContent,
        buttons: {},
        render: (html) => {
            html.find('.wod-diff-btn').click(function() {
                html.find('.wod-diff-btn').removeClass('active');
                $(this).addClass('active');
                html.find('.wod-dmg-diff-input').val($(this).data('val'));
            });

            html.find('.wod-cancel-dmg-btn').click(() => html.closest('.dialog').find('.header-button.close').click());

            html.find('.wod-roll-dmg-btn').click(async () => {
                try {
                    const defenseSucc = Number(html.find('.wod-defense-succ').val()) || 0;
                    const finalDiff = Number(html.find('.wod-dmg-diff-input').val());
                    const dmgManualBonus = Number(html.find('.wod-dmg-manual-bonus').val()) || 0;

                    html.closest('.dialog').find('.header-button.close').click();

                    const netAttackSucc = attackSuccesses - defenseSucc;
                    if (netAttackSucc <= 0) {
                        const missData = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escapeHtml(actor.name)}</strong> промахивается! Цель успешно защитилась (Защита: ${defenseSucc} >= Атака: ${attackSuccesses}).</p>` };
                        if (isBlindAttack) { missData.blind = true; missData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id); }
                        return ChatMessage.create(missData);
                    }

                    const bonusDice = Math.max(0, netAttackSucc - 1);

                    // Сначала бонусы, потом штрафы, защита минимума 1
                    const totalPool = baseDamage + bonusDice + dmgManualBonus;
                    const finalDmgPool = Math.max(1, Math.floor(totalPool));

                    const dmgRoll = new Roll(`${finalDmgPool}d10`);
                    await dmgRoll.evaluate();
                    // Кубы Dice3D летят ВСЕГДА, в том числе при скрытной атаке
                    // (show() молча возвращает false для blind-сообщений — используем showForRoll напрямую).
                    // При скрытной атаке кубы скрыты ото всех, кроме мастера (GM).
                    if (game.dice3d) {
                        const dmgWhisperIds = isBlindAttack ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined;
                        await game.dice3d.showForRoll(dmgRoll, game.user, true, dmgWhisperIds, isBlindAttack);
                    }

                    let dmgSucc = 0, dmgOnes = 0, dmgDiceHTML = "";
                    for (const die of dmgRoll.dice[0].results) {
                        const isSucc = die.result >= finalDiff;
                        const isOne = die.result === 1;
                        if (isSucc) dmgSucc++;
                        if (isOne) dmgOnes++;
                        dmgDiceHTML += createDiceHTML(die.result, isSucc ? 'success' : (isOne ? 'fail' : 'neutral'));
                    }

                    // Единицы вычитают успехи урона: как и в броске атаки
                    // дисциплин (netFromDice = succ - ones). Итог — минимум 1:
                    // это «пол», а не прибавка (0 успехов = 1 урон, но не +1 к имеющимся).
                    dmgSucc = Math.max(1, dmgSucc - dmgOnes);

                    const damageHtml = await renderTemplate(`modules/${MODULE_ID}/templates/chat-fire-damage.html`, {
                        actorName: escapeHtml(actor.name),
                        weaponName: escapeHtml(weapon.name),
                        pool: `Базовый (${baseDamage}) + Успехи (${bonusDice})${dmgManualBonus ? ` ${dmgManualBonus > 0 ? '+' : ''}(${dmgManualBonus}) ручн.` : ''} = ${finalDmgPool}`,
                        difficulty: finalDiff,
                        diceHTML: dmgDiceHTML,
                        damageTotal: dmgSucc,
                        damageType: damageType
                    });

                    const dmgChatData = { speaker: ChatMessage.getSpeaker({ actor }), content: damageHtml };
                    if (isBlindAttack) { dmgChatData.blind = true; dmgChatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id); }
                    await ChatMessage.create(dmgChatData);

                } catch (e) {
                    console.error("WoD Panel | Ошибка урона: ", e);
                    ui.notifications.error("Ошибка урона: " + e.message);
                }
            });
        }
    }, { width: 400, resizable: false }).render(true);
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

    // Ромбовидное меню из 4 кнопок: верх — Здоровье (зелёный), лево — Ресурсы
    // (синий), право — Дисциплины (фиолетовый), низ — Огонь (красный).
    function createIcon(icon, title, tabName, top, left, color, borderColor, hoverColor) {
        const btn = document.createElement("div");
        btn.className = "wod-single-icon";
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.title = title;
        btn.style.cssText = `
            position: absolute; top: ${top}px; left: ${left}px;
            width: 45px; height: 45px; background: ${color}; color: white;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            border: 2px solid ${borderColor}; transition: all 0.2s ease;
            z-index: 2; pointer-events: auto;
        `;
        btn.onmouseenter = () => { btn.style.transform = "scale(1.2)"; btn.style.background = hoverColor; };
        btn.onmouseleave = () => { btn.style.transform = "scale(1)"; btn.style.background = color; };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!hasMoved) {
                openMainPanel(tabName);
            }
        });
        return btn;
    }

    container.appendChild(createIcon("fa-heart",      "Здоровье",   "tab-health",      0,  37, "#10b981", "#34d399", "#059669")); // зелёный — верх
    container.appendChild(createIcon("fa-tint",       "Ресурсы",    "tab-resources",   37, 0,  "#1f5c73", "#5bb9d6", "#2c6b81")); // синий — лево
    container.appendChild(createIcon("fa-book",       "Дисциплины", "tab-disciplines", 37, 75, "#7c3aed", "#a78bfa", "#6d28d9")); // фиолетовый — право
    container.appendChild(createIcon("fa-crosshairs", "Огонь",      "tab-firearms",    75, 37, "#8b0000", "#ff4444", "#a80000")); // красный — низ (из wod-firearms-test)

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
