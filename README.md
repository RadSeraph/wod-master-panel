# wod-master-panel

## Acknowledgements

I would like to express my deepest gratitude to [**JohanFalt**.](https://github.com/JohanFalt/Foundry_WoD20) 

He was the creator of the core system for Foundry VTT, which served as the inspiration for my project. He was the one who opened the door for me to online Vampire: The Masquerade gaming. Without his work and enthusiasm, my module would likely never have seen the light of day.


## Changelog

### v2.0.10 — Возврат летящих кубов (итог истории с анимацией)
- В v2.0.9 кубы пропали совсем: мы убрали встроенный ролл из сообщений чата (`chatData.rolls`) И одновременно перестали показывать кубы вручную, когда активен Dice So Nice!. DSN без `rolls` анимировать нечего — анимации не стало нигде.
- Новая финальная схема (одна анимация без дублей): ролл ВСЕГДА передаётся встроенно в сообщение (`chatData.rolls = [roll]` — дисциплины, выстрел, урон), Foundry/Dice So Nice! анимируют его автоматически ровно один раз. Явных вызовов `game.dice3d.showForRoll` в коде больше нет — хелпер `showDice3dOnce` превращён в no-op для совместимости.
- Проверено: двойного полёта кубов (как в v2.0.8) больше быть не может, потому что источник анимации теперь единственный.
