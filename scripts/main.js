// ==========================================
// WoD MASTER PANEL - ПЛАВАЮЩАЯ КНОПКА (ЦЕНТР)
// ==========================================

Hooks.on("ready", () => {
    console.log("WOD FLOAT | Модуль загружен, создаю кнопку...");

    // Создаем HTML-элемент кнопки
    const btn = document.createElement("div");
    btn.id = "wod-floating-btn";
    btn.innerHTML = '<i class="fas fa-dice-d10"></i>';
    
    // Стили (привязка к центру экрана)
    btn.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        background: #2c6b81;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        z-index: 9999;
        transition: all 0.2s;
        border: 2px solid #5bb9d6;
    `;

    // Эффект при наведении (чуть увеличивается)
    btn.onmouseenter = () => {
        btn.style.transform = "translate(-50%, -50%) scale(1.1)";
        btn.style.background = "#3a8ba8";
    };
    btn.onmouseleave = () => {
        btn.style.transform = "translate(-50%, -50%) scale(1)";
        btn.style.background = "#2c6b81";
    };

    // Клик
    btn.onclick = () => {
        ui.notifications.info("Плавающая кнопка работает!");
        console.log("WOD FLOAT | Кнопка нажата!");
    };

    // Добавляем на страницу
    document.body.appendChild(btn);
});
