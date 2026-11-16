// ==========================================
// 1. ЗАЩИТА ОТ СЖАТОГО ОКНА
// ==========================================
Object.defineProperty(window, 'innerWidth', {value: 1920, writable: true, configurable: true});
Object.defineProperty(window, 'innerHeight', {value: 1080, writable: true, configurable: true});

// ==========================================
// 2. НАСТРОЙКИ И КОНСТАНТЫ
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

function getSavedWindowSize() {
    const saved = localStorage.getItem("wod-panel-size");
    if (saved) {
        try {
            const size = JSON.parse(saved);
            return { width: size.width, height: size.height };
        } catch (e) {}
    }
    return { width: 550, height: 700 };
}

// ==========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
            html += `<option value="${p.id}">${p.name} (Ур. ${p.system.level})${hasRoll ? "" : " (Без броска)"}</option>`;
        });
        html += `</optgroup>`;
    });
    return html;
}

// ==========================================
// 4. СОЗДАНИЕ РАДИАЛЬНОГО МЕНЮ
// ==========================================
Hooks.on("ready", () => {
    console.log("WoD Master Panel | Инициализация...");
    
    const container = document.createElement("div");
    container.id = "wod-radial-menu";
    
    const savedPos = localStorage.getItem("wod-menu-pos");
    let posX = savedPos ? JSON.parse(savedPos).x : window.innerWidth - 100;
    let posY = savedPos ? JSON.parse(savedPos).y : window.innerHeight - 100;

    container.style.cssText = `
        position: fixed; top: ${posY}px; left: ${posX}px; width: 60px; height: 60px; z-index: 9999;
        cursor: grab;
    `;

    const mainBtn = document.createElement("div");
    mainBtn.id = "wod-main-btn";
    mainBtn.innerHTML = '<i class="fas fa-dice-d10"></i>';
    mainBtn.style.cssText = `
        width: 60px; height: 60px; background: #10b981; color: white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 28px; box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        transition: all 0.3s ease; border: 2px solid #34d399; position: relative; z-index: 2;
    `;

    function createSubBtn(icon, title, tabName, x, y) {
        const subBtn = document.createElement("div");
        subBtn.className = "wod-sub-btn";
        subBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        subBtn.title = title;
        subBtn.style.cssText = `
            position: absolute; top: 7px; left: 7px; width: 45px; height: 45px; background: #0f766e; color: white;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            border: 1px solid #14b8a6; transition: all 0.3s ease;
            opacity: 0; pointer-events: none; transform: translate(0px, 0px) scale(0);
            z-index: 1;
        `;
        subBtn.dataset.x = x;
        subBtn.dataset.y = y;
        subBtn.onclick = (e) => { e.stopPropagation(); openMainPanel(tabName); };
        return subBtn;
    }

    const btnHealth = createSubBtn("fa-heart", "Здоровье", "tab-health", 0, -70); 
    const btnRes = createSubBtn("fa-tint", "Ресурсы", "tab-resources", -65, 25); 
    const btnDisc = createSubBtn("fa-book", "Дисциплины", "tab-disciplines", 65, 25); 

    container.appendChild(mainBtn);
    container.appendChild(btnHealth);
    container.appendChild(btnRes);
    container.appendChild(btnDisc);
    document.body.appendChild(container);

    let isDragging = false;
    let startX, startY, initialX, initialY;

    container.addEventListener("mousedown", (e) => {
        if (e.target.closest('.wod-sub-btn')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = container.offsetLeft;
        initialY = container.offsetTop;
        container.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        container.style.left = `${initialX + dx}px`;
        container.style.top = `${initialY + dy}px`;
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = "grab";
            localStorage.setItem("wod-menu-pos", JSON.stringify({x: container.offsetLeft, y: container.offsetTop}));
        }
    });

    let isMenuOpen = false;
    container.addEventListener("mouseenter", () => {
        if (isMenuOpen || isDragging) return;
        isMenuOpen = true;
        mainBtn.style.transform = "rotate(45deg)";
        mainBtn.style.background = "#059669";
        container.querySelectorAll(".wod-sub-btn").forEach(btn => {
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.style.transform = `translate(${btn.dataset.x}px, ${btn.dataset.y}px) scale(1)`;
        });
    });

    container.addEventListener("mouseleave", () => {
        isMenuOpen = false;
        mainBtn.style.transform = "rotate(0deg)";
        mainBtn.style.background = "#10b981";
        container.querySelectorAll(".wod-sub-btn").forEach(btn => {
            btn.style.opacity = "0";
            btn.style.pointerEvents = "none";
            btn.style.transform = `translate(0px, 0px) scale(0)`;
        });
    });
});

// ==========================================
// 5. ОСНОВНОЕ ОКНО
// ==========================================
async function openMainPanel(initialTab = "tab-health") {
    const isGM = game.user.isGM;
    const template = await renderTemplate("modules/wod-master-panel/templates/panel.html", {});
    const windowSize = getSavedWindowSize();
    
    const dialog = new Dialog({
        title: "WoD Master Panel",
        content: template,
        buttons: {
            close: { label: "Закрыть" },
            useDisc: { label: "Использовать", callback: (html) => { executeDiscipline(html); } }
        },
        render: (html) => { 
            setupPanelLogic(html, isGM); 
            if (initialTab !== "tab-health") {
                html.find('.wod-tab-btn').removeClass('active');
                html.find('.wod-tab-content').removeClass('active');
                html.find(`.wod-tab-btn[data-tab="${initialTab}"]`).addClass('active');
                html.find(`#${initialTab}`).addClass('active');
                if (initialTab === 'tab-disciplines') {
                    html.closest('.dialog').find('.dialog-buttons').find('.useDisc').show();
                }
            }
        }
    }, { width: windowSize.width, height: windowSize.height, resizable: true });
    
    dialog.render(true);

    setTimeout(() => {
        const app = Object.values(ui.windows).find(w => w.title === "WoD Master Panel");
        if (app) {
            app.options.closeOnSubmit = false;
            const originalSetPosition = app.setPosition.bind(app);
            app.setPosition = function(position) {
                originalSetPosition(position);
                if (position.width && position.height) {
                    localStorage.setItem("wod-panel-size", JSON.stringify({ width: position.width, height: position.height }));
                }
            };
        }
    }, 100);
}

// ==========================================
// 6. ЛОГИКА ПАНЕЛИ
// ==========================================
function setupPanelLogic(html, isGM) {
    html.find('.wod-tab-btn').click(function() {
        html.find('.wod-tab-btn').removeClass('active');
        html.find('.wod-tab-content').removeClass('active');
        $(this).addClass('active');
        html.find('#' + $(this).data('tab')).addClass('active');
        
        const dialogButtons = html.closest('.dialog').find('.dialog-buttons');
        if ($(this).data('tab') === 'tab-disciplines') { dialogButtons.find('.useDisc').show(); }
        else { dialogButtons.find('.useDisc').hide(); }
    });

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
        html.find('#disc-actor-block').hide();
    } else {
        let actorOptions = "";
        players.filter(a => a.items.some(i => i.type === "Power" && i.system.level > 0)).forEach(a => actorOptions += `<option value="${a.id}">${a.name}</option>`);
        html.find('#disc-actor-select').html(actorOptions);
    }

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
        processHealthAction(html, type, val, useBlood, npcId, players);
    });

    html.find('#tab-resources .wod-grid-btn').click(function() {
        const type = $(this).data('type'); const val = parseInt($(this).data('val'));
        const npcId = isGM ? html.find('#res-npc-select').val() : "";
        processResourceAction(html, type, val, npcId, players);
    });

    // ЛОГИКА КНОПОК СЛОЖНОСТИ
    const diffContainer = html.find('#disc-difficulty-buttons');
    const diffInput = html.find('#disc-difficulty');
    
    const renderDifficultyButtons = (currentDiff) => {
        diffContainer.empty();
        for (let i = 3; i <= 10; i++) {
            const isActive = i === currentDiff;
            const btn = $(`<button type="button" class="wod-diff-btn" data-val="${i}" style="flex: 1; padding: 5px 0; background: ${isActive ? '#2c6b81' : '#1f5c73'}; color: white; border: 1px solid ${isActive ? '#5bb9d6' : '#333'}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">${i}</button>`);
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

        let desc = power.system.description || "Нет описания.";
        if (power.system.details) desc += `<hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;">` + power.system.details;
        html.find('#disc-description').html(desc);

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
        if (bCost > 0) parts.push(`${bCost} Кровь`);
        if (wCost > 0) parts.push(`${wCost} Воля`);

        if (parts.length > 0) html.find('#disc-final-cost').html(`Итоговая стоимость: <span style="color: #8b0000;">${parts.join(' | ')}</span>`);
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

    updateDiscUI();
    html.closest('.dialog').find('.dialog-buttons').find('.useDisc').hide();
}

// ==========================================
// 7. ФУНКЦИИ ОБРАБОТКИ
// ==========================================
async function processHealthAction(html, type, value, useBlood, npcId, players) {
    let targets = [];
    if (npcId) { targets = [game.actors.get(npcId)]; } else {
        const activeBtns = html.find('.wod-tab-content.active .wod-actor-btn.active');
        if (activeBtns.length === 0) return ui.notifications.warn("Выберите персонажа!");
        if (html.find('.wod-actor-btn[data-id="ALL"].active').length > 0) { targets = players; } else {
            activeBtns.each(function() { targets.push(game.actors.get($(this).data('id'))); });
        }
    }
    const namesMap = { bashing: "Дробящий", lethal: "Летальный", aggravated: "Аггравированный" };
    let updatedCount = 0, totalBloodCost = 0;
    for (const actor of targets) {
        if (!actor) continue;
        const current = foundry.utils.getProperty(actor, CONFIG.healthPath); if (!current) continue;
        let b = Number(current.bashing) || 0, l = Number(current.lethal) || 0, a = Number(current.aggravated) || 0, bloodCost = 0;
        if (value > 0) {
            if (type === "bashing") b += value;
            else if (type === "lethal") { const ab = Math.min(value, b); b -= ab; l += value; }
            else if (type === "aggravated") { const ab = Math.min(value, b); b -= ab; const al = Math.min(value - ab, l); l -= al; a += value; }
        } else {
            const h = Math.abs(value);
            if (type === "aggravated") { const ah = Math.min(a, h); bloodCost = ah * 5; a -= ah; }
            else if (type === "lethal") { const ah = Math.min(l, h); bloodCost = ah * 1; l -= ah; }
            else if (type === "bashing") { const ah = Math.min(b, h); bloodCost = ah * 1; b -= ah; }
        }
        let total = b + l + a;
        if (total > 7) {
            if (type === "bashing") b = Math.max(0, 7 - l - a);
            else if (type === "lethal") l = Math.max(0, 7 - b - a);
            else if (type === "aggravated") a = Math.max(0, 7 - b - l);
        }
        let canUpdate = true;
        if (bloodCost > 0 && useBlood) {
            const curB = foundry.utils.getProperty(actor, CONFIG.bloodPath);
            if (curB !== undefined) {
                const bNum = Number(curB) || 0;
                if (bNum < bloodCost) { ui.notifications.warn(`${actor.name}: мало Крови!`); canUpdate = false; }
                else { await actor.update({ [CONFIG.bloodPath]: bNum - bloodCost }); totalBloodCost += bloodCost; }
            }
        }
        if (canUpdate && (b !== current.bashing || l !== current.lethal || a !== current.aggravated)) {
            await actor.update({ [`${CONFIG.healthPath}.bashing`]: b, [`${CONFIG.healthPath}.lethal`]: l, [`${CONFIG.healthPath}.aggravated`]: a });
            updatedCount++;
        }
    }
    if (updatedCount > 0 || targets.length > 0) {
        let targetName = targets.map(t => t.name).join(', ');
        let bloodText = totalBloodCost > 0 ? ` (потрачено ${totalBloodCost} Крови)` : (value < 0 && !useBlood ? ` (без траты Крови)` : "");
        let chatData = { speaker: ChatMessage.getSpeaker(), content: `<p><strong>${targetName}</strong> ${value > 0 ? "получает" : "лечит"} <strong>${Math.abs(value)}</strong> ${namesMap[type]} урона${bloodText}.</p>` };
        
        if (npcId || !game.user.isGM) {
            let whisperTargets = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
            if (!game.user.isGM) whisperTargets.push(game.user.id);
            chatData.whisper = whisperTargets;
        }
        ChatMessage.create(chatData);
    }
}

async function processResourceAction(html, type, value, npcId, players) {
    let targets = [];
    if (npcId) { targets = [game.actors.get(npcId)]; } else {
        const activeBtns = html.find('.wod-tab-content.active .wod-actor-btn.active');
        if (activeBtns.length === 0) return ui.notifications.warn("Выберите персонажа!");
        if (html.find('.wod-actor-btn[data-id="ALL"].active').length > 0) { targets = players; } else {
            activeBtns.each(function() { targets.push(game.actors.get($(this).data('id'))); });
        }
    }
    const paths = { blood: { path: CONFIG.bloodPath, max: CONFIG.bloodMax, name: "Кровь" }, will: { path: CONFIG.willPath, max: CONFIG.willMax, name: "Волю" } };
    const config = paths[type];
    let updatedCount = 0;
    for (const actor of targets) {
        if (!actor) continue;
        const current = foundry.utils.getProperty(actor, config.path); if (current === undefined) continue;
        const max = foundry.utils.getProperty(actor, config.max) || 10;
        let newValue = Math.max(0, Math.min(max, current + value));
        if (newValue !== current) { await actor.update({ [config.path]: newValue }); updatedCount++; }
    }
    if (updatedCount > 0) {
        let chatData = { speaker: ChatMessage.getSpeaker(), content: `<p><strong>${targets.map(t => t.name).join(', ')}</strong> ${value > 0 ? "восстанавливает" : "тратит"} <strong>${Math.abs(value)}</strong> ${config.name}.</p>` };
        
        if (npcId || !game.user.isGM) {
            let whisperTargets = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
            if (!game.user.isGM) whisperTargets.push(game.user.id);
            chatData.whisper = whisperTargets;
        }
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

    const inputBloodX = html.find('#input-blood-x'); const inputWillX = html.find('#input-will-x');
    let finalBlood = 0, finalWill = 0;

    const textToScan = ((power.system.description || "") + " " + (power.system.details || "")).toLowerCase();
    const bloodMatch = textToScan.match(/(\d+|x)\s*(?:bp|blood\s*points?|пункт[а-я]*\s*кров[а-я]*)/i);
    const willMatch = textToScan.match(/(\d+|x)\s*(?:wp|willpower\s*points?|пункт[а-я]*\s*вол[а-я]*)/i);

    if (power.system.spendblood === true && !bloodMatch) finalBlood = 1;
    else if (bloodMatch) { if (bloodMatch[1].toLowerCase() === "x" && inputBloodX.length) finalBlood = parseInt(inputBloodX.val()) || 1; else finalBlood = parseInt(bloodMatch[1]); }
    if (willMatch) { if (willMatch[1].toLowerCase() === "x" && inputWillX.length) finalWill = parseInt(inputWillX.val()) || 1; else finalWill = parseInt(willMatch[1]); }
    if (useWillpower) finalWill += 1; 

    let resourceHTML = "";
    if (finalBlood > 0) {
        const curB = Number(foundry.utils.getProperty(actor, CONFIG.bloodPath)) || 0;
        if (curB < finalBlood) return ui.notifications.error(`${actor.name}: мало Крови!`);
        await actor.update({ [CONFIG.bloodPath]: curB - finalBlood });
        resourceHTML += `<p style="color: #8b0000; margin: 2px 0;"><em>Потрачено ${finalBlood} Крови (осталось ${curB - finalBlood}).</em></p>`;
    }
    if (finalWill > 0) {
        const curW = Number(foundry.utils.getProperty(actor, CONFIG.willPath)) || 0;
        if (curW < finalWill) return ui.notifications.error(`${actor.name}: мало Воли!`);
        await actor.update({ [CONFIG.willPath]: curW - finalWill });
        resourceHTML += `<p style="color: #00008b; margin: 2px 0;"><em>Потрачено ${finalWill} Воли (осталось ${curW - finalWill}).</em></p>`;
    }

    let rollHTML = "";
    if (power.system.dice1) {
        const attrKey = power.system.dice1, skillKey = power.system.dice2;
        let attrValue = attrKey === "willpower" ? (Number(foundry.utils.getProperty(actor, CONFIG.willPerm)) || 0) : (Number(foundry.utils.getProperty(actor, `system.attributes.${attrKey}.total`)) || 0);
        let skillValue = skillKey ? (Number(foundry.utils.getProperty(actor, `system.abilities.${skillKey}.value`)) || 0) : 0;
        const pool = attrValue + skillValue;
        if (pool > 0) {
            const roll = new Roll(`${pool}d10`); 
            await roll.evaluate();

            // ИНТЕГРАЦИЯ DICE SO NICE
            if (game.dice3d) {
                await game.dice3d.showForRoll(roll, game.user, true);
            }

            let succ = 0, ones = 0;
            for (let die of roll.dice[0].results) { if (die.result >= customDifficulty) succ += (die.result === 10 && useSpeciality) ? 2 : 1; if (die.result === 1) ones++; }
            let net = Math.max(0, succ - ones); if (useWillpower) net += 1;
            const diceHTML = roll.dice[0].results.map(d => {
                let color = d.result >= customDifficulty ? "#4caf50" : (d.result === 1 ? "#f44336" : "#ccc");
                if (d.result === 10 && useSpeciality) color = "#ffd700";
                return `<span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: #222; color: ${color}; border: 1px solid ${color}; border-radius: 4px; margin: 2px; font-weight: bold;">${d.result}</span>`;
            }).join("");
            let wpText = useWillpower ? `<br><span style="color: #00008b; font-weight: bold;">+1 автоуспех</span>` : "";
            rollHTML = `<div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; text-align: center;"><div style="margin-bottom: 5px;">Пул: <strong>${pool}d10</strong> (Сложность: ${customDifficulty})</div><div>${diceHTML}</div><div style="margin-top: 5px; font-size: 1.1em;">Успехи: <strong style="color: #2e6b4e;">${net}</strong>${wpText}</div></div>`;
        }
    } else { rollHTML = `<div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; text-align: center; font-style: italic; color: #555;">Эта сила не требует броска.</div>`; }

    let chatData = { speaker: ChatMessage.getSpeaker({ actor: actor }), content: `<div style="font-family: 'Signika', sans-serif;"><h3 style="margin-top: 0; margin-bottom: 5px; border-bottom: 2px solid #8b0000; padding-bottom: 3px;">${power.name}</h3>${resourceHTML}${rollHTML}<div style="margin-top: 10px; font-size: 0.9em; border-top: 1px solid #ccc; padding-top: 5px;">${power.system.description || ""}${power.system.details || ""}</div></div>` };
    
    if (isBlind) {
        chatData.blind = true;
    } else {
        const players = getPlayerActors();
        if (!players.some(p => p.id === actor.id) || !isGM) {
            let whisperTargets = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
            if (!isGM) whisperTargets.push(game.user.id);
            chatData.whisper = whisperTargets;
        }
    }
    
    ChatMessage.create(chatData);
}
