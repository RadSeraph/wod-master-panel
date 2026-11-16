// ==========================================
// WoD MASTER PANEL - ОСНОВНОЙ СКРИПТ (v14)
// ==========================================

Hooks.on("ready", () => {
    console.log("WoD Master Panel | Модуль успешно загружен!");

    Hooks.on("getSceneControlButtons", (controls) => {
        console.log("WoD Master Panel | Тест: структура панели - ", controls);
        
        // В Foundry v14 панель может называться по-разному. 
        // Мы проверяем оба популярных варианта: tokens и token.
        let targetLayer = controls.tokens || controls.token;

        if (targetLayer) {
            targetLayer.tools["wod-master-panel"] = {
                name: "wod-master-panel",
                title: "WoD Master Panel",
                icon: "fas fa-dice-d10",
                button: true,
                onChange: () => {
                    // Временная заглушка. Если кнопка появится, мы увидим это сообщение.
                    ui.notifications.info("Кнопка пульта нажата! (Скоро здесь откроется окно)");
                    console.log("WoD Master Panel | Кнопка нажата!");
                }
            };
            console.log("WoD Master Panel | Кнопка успешно добавлена в слой!");
        } else {
            console.error("WoD Master Panel | ОШИБКА: Не найден слой токенов. Проверьте названия слоев выше.");
        }
    });
});
