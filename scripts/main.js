Hooks.on("ready", () => {
    console.log("WoD Master Panel | Модуль загружен!");

    Hooks.on("getSceneControlButtons", (controls) => {
        console.log("WoD Master Panel | Хук сработал! Controls:", controls);
        
        if (controls.tokens) {
            controls.tokens.tools["wod-master-panel"] = {
                name: "wod-master-panel",
                title: "WoD Master Panel",
                icon: "fas fa-dice-d10",
                button: true,
                onChange: () => {
                    console.log("WoD Master Panel | Кнопка нажата!");
                    ui.notifications.info("Кнопка работает!");
                }
            };
        }
    });
});
