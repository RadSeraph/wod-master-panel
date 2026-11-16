Hooks.on("ready", () => {
    console.log("WOD DIAG | Модуль загружен");

    Hooks.on("getSceneControlButtons", (controls) => {
        // 1. Выводим список всех ключей (слоев), которые есть в controls
        const layerNames = Object.keys(controls);
        console.log("WOD DIAG | Доступные слои:", layerNames);

        // 2. Проверяем, есть ли слои tokens или token
        let targetKey = null;
        if (controls.tokens) targetKey = "tokens";
        else if (controls.token) targetKey = "token";

        if (!targetKey) {
            console.error("WOD DIAG | Слой токенов НЕ НАЙДЕН! Смотрите список слоев выше.");
            return;
        }

        console.log(`WOD DIAG | Использую слой: ${targetKey}`);

        // 3. Пытаемся добавить кнопку с обязательным activeTool (заглушка)
        const layer = controls[targetKey];
        
        // Проверяем, есть ли уже tools
        if (!layer.tools) layer.tools = {};

        // Добавляем кнопку
        layer.tools["wod-test-btn"] = {
            name: "wod-test-btn",
            title: "WoD Test Button",
            icon: "fas fa-dice-d10",
            button: true,
            onChange: () => {
                ui.notifications.info("Тестовая кнопка нажата!");
                console.log("WOD DIAG | Кнопка нажата!");
            }
        };

        // Если в слое нет activeTool, устанавливаем его принудительно
        if (!layer.activeTool) {
            layer.activeTool = "wod-test-btn";
            console.log("WOD DIAG | Принудительно установлен activeTool");
        }

        console.log("WOD DIAG | Кнопка добавлена в tools слоя " + targetKey);
    });
});
