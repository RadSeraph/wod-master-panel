# wod-master-panel

## Changelog

### 1.4.0 — Слияние с `wod-firearms-test` (стрельба)
- Стрельба стала четвёртой вкладкой **«Огонь»** основного пульта: отдельная плавающая красная кнопка и второй модуль больше не нужны.
- **Логика ран приведена к единой (материнской)**: штрафы от ран, блокировка действий «При смерти» и пути к данным (`CONFIG.willPath` для списания Воли) теперь берутся из этого модуля — дублирующий код из `wod-firearms-test` удалён. При слиянии сохранено поведение обеих панелей; намеренное отличие дочернего модуля (автозакрытие панели при выстреле) убрано — пульт остаётся открытым.
- Ромбовидное меню расширено до четырёх разноцветных кнопок: **Здоровье** (зелёная, верх), **Ресурсы** (синяя, лево), **Дисциплины** (фиолетовая, право), **Огонь** (красная, низ). Позиция меню по-прежнему перетаскивается и запоминается.
- Добавлены шаблоны карточек чата `templates/chat-fire-attack.html`, `templates/chat-fire-damage.html` и стили стрельбы в `styles/main.css`.

## Acknowledgements

I would like to express my deepest gratitude to [**JohanFalt**.](https://github.com/JohanFalt/Foundry_WoD20) 

He was the creator of the core system for Foundry VTT, which served as the inspiration for my project. He was the one who opened the door for me to online Vampire: The Masquerade gaming. Without his work and enthusiasm, my module would likely never have seen the light of day.
