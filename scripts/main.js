Hooks.on("ready", () => {
    console.log("WoD Master Panel | ТЕСТОВЫЙ РЕЖИМ ЗАПУЩЕН!");

    Hooks.on("getSceneControlButtons", (controls) => {
        console.log("WoD Master Panel | Хук панели сработал! Вот структура:", controls);
        
        if (controls.tokens) {
            controls.tokens.tools["wod-master-panel"] = {
                name: "wod-master-panel",
                title: "WoD Master Panel",
                icon: "fas fa-dice-d10",
                button: true,
                onChange: () => {
                    ui.notifications.info("Тестовая кнопка нажата!");
                }
            };
        }
    });
});
