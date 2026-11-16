// ==========================================
// ЗАЩИТА ОТ СЖАТОГО ОКНА (для консоли F12)
// ==========================================
if (window.innerWidth < 1024) {
    Object.defineProperty(window, 'innerWidth', {value: 1920, writable: true});
    Object.defineProperty(window, 'innerHeight', {value: 1080, writable: true});
}

// ==========================================
// WoD MASTER PANEL - ОСНОВНОЙ КОД
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

// Создание плавающей кнопки (независимо от панели инструментов)
Hooks.on("ready", () => {
    console.log("WoD Master Panel | Инициализация...");
    
    // Создаем кнопку
    const btn = document.createElement("div");
    btn.id = "wod-floating-btn";
    btn.innerHTML = '<i class="fas fa-dice-d10"></i>';
    btn.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px;
        background: #2c6b81; color: white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        z-index: 9999; transition: transform 0.2s;
    `;
    btn.onclick = () => openMainPanel();
    document.body.appendChild(btn);
});

// ==========================================
// ОСНОВНОЕ ОКНО И ЛОГИКА
// ==========================================
async function openMainPanel() {
    const isGM = game.user.isGM;
    const template = await renderTemplate("modules/wod-master-panel/templates/panel.html", {});
    
    new Dialog({
        title: "WoD Master Panel",
        content: template,
        buttons: {
            close: { label: "Закрыть" },
            useDisc: { label: "Использовать", callback: (html) => { executeDiscipline(html); } }
        },
        render: (html) => { setupPanelLogic(html, isGM); }
    }, { width: 550, height: 700, resizable: true }).render(true);
}

function setupPanelLogic(html, isGM) {
    // ... (здесь вставь код логики из предыдущего сообщения, я его сократил для теста) ...
    // Если коротко: переключение вкладок, заполнение списков и т.д.
    
    // Для проверки работоспособности выведем просто уведомление:
    ui.notifications.info("Пульт открывается! Логика загружена.");
    
    // (В финальной версии здесь будет весь наш код, который мы писали ранее)
}
