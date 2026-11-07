# Независимый core симуляции

**UNAPPROVED — исследование и проект границы, не разрешение на реализацию.** Срез исходников: `8d1f4522d53e57ad781164c1f0d7f2dbe3897227`, 08.11.2026. Движок, сборки, тесты и работающий сервер не изменялись и не запускались в рамках этого исследования.

## Для общего обсуждения

Вынос всей игровой логики реалистичнее делать на существующем C: `game.c`, `people.c`, `tower.c` уже составляют симуляцию без SDL. Но это ещё не независимый модуль: правила строительства и часть экономики живут в `main.c`, состояние распылено по globals/statics, web callbacks находятся в `game.c`, а `.sav` зависит от ABI. Новая оболочка поверх нынешних функций унаследует эти связи.

Предлагаемое направление: сначала завершить границу C core, сохраняя механики; затем открыть небольшой C/WASM API для выбранного UI. Полная перепись оправдана отдельным решением о смене механик и языка, а не необходимостью сменить renderer. Стоимость определяется переносом правил, состояния и сохранений; преимуществ по скорости без измерений обещать нельзя.

Решения для следующего обсуждения: сохраняем ли текущую симуляцию как эталон; нужен ли точный перенос текущих сохранений между native/web; допускаются ли изменения случайных последовательностей. Ни одно здесь не принято.

## Где граница проходит сейчас

Все ссылки ниже закреплены на исследованном commit; комментарии об «аутентичности» — утверждения текущего кода, историческая точность отдельно не проверялась.

| Узел | Уже отделено | Что мешает независимому core |
|---|---|---|
| [`game_update`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L1619), `GameSim` | Календарь, жильцы, доходы/расходы, звёзды, медицина, гостиницы, торговля, катастрофы, свадьба; вызов people pipeline | `EM_ASM` вызывает web analytics; функции сериализации работают с файлами; часть состояния находится в statics. |
| [`PeopleSim`](https://github.com/neoromantic/tower/blob/8d1f452/src/people.h#L236), `people_update` | Люди, маршруты, очереди, кабины, расписания, ожидание и поездки | `TUNING`, VIP, office presence, `XFER`, edit-mode snapshot глобальны; несколько `PeopleSim` ещё не означают независимые миры. |
| [`Tower`](https://github.com/neoromantic/tower/blob/8d1f452/src/tower.h#L426), `tower_place/remove` | Сетка, объекты, большая часть геометрии/стоимости/ограничений, данные имён | В `Tower` есть камера и raw-блоки старого формата. `tower.c` включает `game.h`; это взаимная связь внутренних частей core, а не зависимость от UI. |
| [`main.c: Game`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L347) | SDL, окна, ввод, камера, отрисовка и диалоги закономерно принадлежат shell | Единый `static Game game` содержит и `Tower/GameSim`, и UI. Обработчики напрямую меняют мир. |
| [`twr_import/export`](https://github.com/neoromantic/tower/blob/8d1f452/src/twr.c#L100) | Самостоятельный codec оригинальных файлов без SDL | Файловый I/O; импорт восстанавливает часть состояния, экспорт меняет `Tower` при выделении retail slots. Это не чистый snapshot и не точное сохранение всей текущей симуляции. |
| [`sound_hook`](https://github.com/neoromantic/tower/blob/8d1f452/src/sound_hook.h#L1) | Симуляция не линкуется с SDL/audio backend; существующий hook позволяет headless | Hook глобальный, принимает WAV resource ID; это зависимость от представления, хотя зависимости от SDL нет. |
| [`Makefile`](https://github.com/neoromantic/tower/blob/8d1f452/Makefile#L1) | Native и web компилируют одни исходники | Основная сборка объединяет shell/core/assets/audio. Web использует ASYNCIFY и blocking loop целого приложения; независимый core не требует переносить этот loop в новый UI. |

Размеры помогают локализовать работу, но не оценивают сроки: `main.c` — 11 701 строка, `game.c` — 4 493, `people.c` — 3 227, `tower.c` — 1 669; большие файлы изучались по относящимся к задаче участкам.

## Скрытые правила в main.c, которые тоже должны попасть в core

Это конкретные hotspots, а не исчерпывающий аудит всех 11 тысяч строк. Критерий полного выноса: shell больше не пишет игровые поля и не принимает решения о допустимости/цене/последствиях действий.

| Символ / место | Содержание, которое принадлежит core | Что остаётся UI |
|---|---|---|
| [`item_unlocked`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L5048) | Campaign/Sandbox и star gate | Скрыть/затемнить кнопку. Проверка доступности должна действовать и для API-команды. |
| [`elev_add_car_at`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L8348) | Лимит кабин, цена, списание денег, `built_value`, home/позиция новой кабины | Перевод клика в shaft/floor и сообщение результата. |
| [`drag_place_units`, `metro_seed_evening_aux`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L8395) | Последовательность размещений, post-build metro state и `game_notify_built`, который выдаёт клад | Drag gesture, preview и преобразование пикселей в клетки. Порядок и частичный успех серии размещений должны сохраняться явно. |
| [`request_stop_toggle`, `request_remove_tenant`, `remove_shaft_now`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L6265) | Route-loss check, удаление шахты и записей/клеток, отсутствие возврата денег | Диалог подтверждения. Core возвращает причину и принимает подтверждённую команду; UI не повторяет правило. |
| [`mp_apply`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L2584) | Отбор объектов для массовой цены; запрет менять цену проданного condo | Выбор фильтра, dropdown и текст отчёта. `game_set_rent_class` уже выполняет re-judge. |
| [`elv_dialog_click_faithful`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L3407) | Расписания, пределы threshold/patience, запреты edit mode; прямые записи в `sched_*` | Геометрия, выбранная вкладка/период, `hidden` как presentation preference. |
| [`tenant_set_name`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L6540) | Лимит 20 именованных tenants, изменение имени | Редактор текста и focus. |
| [`main loop`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L11045) | Игровые pause/edit/decision режимы должны иметь контракт, а не зависеть от открытого SDL-окна | Подача фиксированных ticks, wall-clock pacing и автосохранение. Сейчас NORMAL вызывается каждый четвёртый render frame, FAST — каждый frame. |
| [`pending_star_up`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L11403) и другие notice flags | Семантическое событие и его payload | Локализованный текст, art, pan камеры и acknowledgement показа. Сейчас UI сбрасывает поля самого `GameSim`. |

Уже имеющиеся `game_event_proceed/ransom`, `game_set_rent_class`, `game_change_movie`, `people_set_*` стоит использовать как основу, а не дублировать правила новым framework.

## Состояние, RNG, графика и звук

- **Одного `GameSim + Tower` недостаточно.** [`TUNING` и `people_init`](https://github.com/neoromantic/tower/blob/8d1f452/src/people.c#L40): инициализация одного people world сбрасывает общую таблицу. [`XFER`](https://github.com/neoromantic/tower/blob/8d1f452/src/people.c#L355) кэшируется по layout stamp без идентификатора мира. VIP statics находятся около строки 263, office counters — 191, `noroute_latch` — 97. [`people_edit_enter`](https://github.com/neoromantic/tower/blob/8d1f452/src/people.c#L2144) хранит snapshot и временно меняет глобальный sound hook. [`game_update`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L1623) имеет static `reach_throttle`; вне `GameSim` также star nags, income ticker, name-purge day. Для конечного независимого модуля каждое изменяемое значение должно принадлежать миру либо быть явно производным scratch/cache. Константы переносить в state незачем.
- **Общий RNG связывает представление и правила.** [`ambience probe`](https://github.com/neoromantic/tower/blob/8d1f452/src/main.c#L905), [`occupant animation`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L3167), выбор фильма в [`tower.c`](https://github.com/neoromantic/tower/blob/8d1f452/src/tower.c#L1259), болезни и выбор целей катастроф используют `rand()`. Убрать ambience/cosmetics — значит изменить расход общей последовательности. В `people.c` также есть выбор через `frame * 31 + i`, не весь выбор является вызовом RNG. Целевой контракт: алгоритм и состояние RNG принадлежат core и входят в save; presentation RNG независим. Само разделение последовательностей — изменение поведения, его нельзя незаметно включать в механический перенос.
- **Render data смешаны с механикой.** [`GameSim.occupants`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.h#L786) хранит sprite frames; `Tower` — `cam_x/cam_y`; Santa API принимает `screen_w`. Геометрия клетки в пикселях находится в `tower.h`. В первой стадии такие поля можно оставить для сохранения поведения. В конечной границе core выдаёт игровые координаты/состояния, renderer выбирает sprite и экранное положение. Office presence и maid marks нужны как read-only наблюдения; их удаление не равно удалению ненужной логики.
- **Побочные эффекты наружу.** [`notify_star_up/pop_milestones/day_report`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L20) обращаются к `window` через `EM_ASM`; это следует заменить семантическими событиями, которые shell направляет в аналитику. Звук аналогично: core сообщает результат/действие, shell выбирает WAV, громкость, mute и loop. На первой стадии существующий hook уже достаточен для headless; создавать новую аудиосистему не нужно.

## Минимальный документируемый контракт

Это проект публичного API, **не готовые функции**. Core — один владелец изменяемого мира. Небольшой набор операций: создать/освободить мир, применить команду, продвинуть ticks, получить snapshot/events, кодировать/восстановить save. Отдельный endpoint на каждый getter или универсальная plugin/ECS/event-sourcing система здесь не нужны.

| Часть | Контракт |
|---|---|
| Создание | Явные mode, seed и immutable content/rules revision. Native и WASM получают одинаковые входные данные. |
| Commands | Build/extend deck/shaft, demolish, add/remove car, stop/home/schedule, price/bulk price, tenant/person name, movie, disaster decision, enter/exit transport edit, pause/resume. Координаты — клетки/этажи и IDs, не mouse events. Результат содержит успех/причину/необходимость подтверждения. Определены порядок batch, частичный успех и момент применения относительно tick. |
| Tick | Целое число шагов; один шаг сохраняет нынешний порядок `game_update` и календарь 2600 ticks/day. UI планирует вызовы по времени; modal decision и edit freeze имеют игровую семантику. Поведение обновления layout при pause оговаривается отдельно: сейчас оно происходит до раннего return. |
| Snapshot | Read-only состояние на конкретном tick: сетка, tenants, люди/кабины, финансы, доступность, warnings, режим ожидания решения. В C сначала достаточно read-only views существующих массивов; публичный WASM DTO не раскрывает внутренние offsets struct. Срок жизни view — до следующей мутации. Snapshot для UI не заменяет полный save. |
| Events | Упорядоченные события с tick и IDs/payload: построено/отказано, звезда/клад, VIP, disaster offer/resolution, медицинское/route предупреждение, завершён день. Shell получает каждый пакет один раз; отсутствие renderer/audio/analytics не влияет на развитие мира. Эфемерные sound/notice события не воспроизводятся автоматически при load. |
| Save | Core кодирует bytes; shell владеет путём, диском/IndexedDB, ротацией и async sync. В документированном формате — schema/rules/content revision, фиксированные ширины чисел и порядок bytes, полный логический state и RNG; caches пересчитываются. UI preferences хранятся отдельно. Предел денег и представление 64-bit чисел через JS ABI выбираются явно. |
| Content | Пока источником истины остаются C-таблицы: [`ITEM_WIDTH/HEIGHT/COST/STAR_REQ`](https://github.com/neoromantic/tower/blob/8d1f452/src/tower.h#L72), [`CONSTRUCTION_TIME`, rent/population/activity](https://github.com/neoromantic/tower/blob/8d1f452/src/game.h#L233), [`Tuning`](https://github.com/neoromantic/tower/blob/8d1f452/src/people.h#L35). Документировать ID, единицы, диапазон, смысл и revision; не вводить JSON parser ради extraction. Asset keys, названия и sprite layout принадлежат UI content. Если нужен moddable content — отдельная схема этих данных и проверяемые ограничения фиксированных массивов; смена таблиц сама по себе не создаст новые механики. |

## Сохранения: отдельная работа

[`game_save`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L4195) пишет header и raw `Tower`, `GameSim`, `TUNING`. Проверка `sizeof` не определяет переносимый формат: `long`, alignment, enums и padding зависят от ABI. Сам код [прямо отмечает](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L4234) различие native/wasm32. Global RNG и перечисленные statics этим dump не сохраняются, поэтому успешный round-trip не доказывает точное продолжение будущего.

[`ct_sav_to_tdt`](https://github.com/neoromantic/tower/blob/8d1f452/src/game.c#L4342) создаёт scratch state и сохраняет/возвращает `TUNING`: известное изменение этой общей таблицы здесь учтено. Однако сама необходимость такого восстановления показывает отсутствие независимого ownership. `game_load` также сбрасывает `style_ctr` загружаемой башни, поэтому load нельзя считать побитовым восстановлением исходного snapshot. `.TDT` — переносимый обмен исходным форматом, не замена полноте `.sav`: importer [читает и игнорирует часть полей](https://github.com/neoromantic/tower/blob/8d1f452/src/twr.c#L124), а exporter ограничен старой моделью.

Минимальный первый вынос может оставить текущий codec и layout. **Не добавлять совместимость со всеми старыми версиями как попутную задачу.** Новый переносимый формат — отдельный согласованный шаг; сохранение текущих файлов/старого executable и решение о разовом converter предшествуют переключению пользователя. Пока требования к старым сохранениям не выбраны, обещать бесшовный перенос нельзя.

На web сохранение включает две операции: запись в виртуальную FS и асинхронную персистенцию. В текущем [`shell.html`](https://github.com/neoromantic/tower/blob/8d1f452/web/shell.html#L650) IDBFS загружается до main. [Официальная FS API](https://emscripten.org/docs/api_reference/Filesystem-API.html#FS.syncfs) определяет `syncfs(true)` как populate, `false` — persist. Сообщение «сохранено» должно соответствовать завершённому persist, а не только возврату C codec.

## C + WASM или полная перепись

| Вариант | Цена и результат |
|---|---|
| Завершить C core, оставить SDL UI | Наименьшая поверхность семантических изменений. Переносятся конкретные handlers/state/side effects; существующий renderer продолжает работать. Это полноценный первый результат, даже без нового UI. |
| Тот же C core + WASM boundary | Дополнительно экспорт команд, snapshot buffer/DTO, события и save bytes; UI можно заменить независимо. Передавать пакет состояния, а не вызывать JS на каждого человека/клетку. Web Worker не обязателен на старте; он добавит messaging, ownership и согласование снимков и требует отдельного обоснования. |
| Переписать core целиком | Повторно реализуются календарь, transport/routing, tenant economy, disaster/VIP/wedding, content и serializers. Нужен тот же контракт плюс доказательство поведения между языками. Даёт свободу новой модели, но перенос UI сам по себе этой цены не оправдывает. Точные сроки и выигрыш неизвестны. |

По [официальному Emscripten interop guide](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html) C функции доступны из JS через exports/`ccall`/`cwrap`; нужные символы и runtime methods следует экспортировать явно. Существующий `ct_sav_meta` уже показывает узкую границу. Указатель WASM не является JS object: массивы передаются через linear memory. При `ALLOW_MEMORY_GROWTH` старые typed-array views могут стать недействительными; контракт владения snapshot должен это учитывать. Это аргумент за явный buffer lifetime, а не за большой binding framework. Документация проверена через Context7 08.11.2026; конкретная установленная версия emcc и performance не проверялись.

## Как сохранять поведение по стадиям

1. **Зафиксировать наблюдаемое поведение.** Определить, что является эталоном текущей игры, а что намеренно меняется. Записать команды и ключевые состояния календаря/денег/поездок на исследуемой версии. Текущий shared `rand()` и statics сначала учитывать как есть; seed сам по себе ещё не даёт переносимый replay.
2. **Закрыть игровые команды на C.** Переносить по одному перечисленному hotspot из `main.c`, вызывая его из прежнего UI; сохранять порядок размещения, цену и post-build effects. Не менять одновременно механику или UI. Целевой критерий — прямые записи UI в игровые данные исчезли.
3. **Собрать state и эффекты.** Разделить persisted state, derived caches и presentation; globals/statics сделать принадлежащими миру, заменить web callbacks событиями. Сравнить новый core со старым при одинаковом потоке входов. Разделение RNG и перенос cosmetic state пометить отдельными семантическими изменениями, если нельзя сохранить прежний расход случайных чисел.
4. **Открыть WASM API.** Те же команды и snapshots, та же C реализация; сначала прежний UI, затем новый. Переносимый save — отдельный результат с собственной проверкой, а не условие любого первого extraction.
5. **Менять механику отдельными решениями.** После каждого выбранного изменения меняется rules revision и сценарии, объясняющие новое поведение. Старые ошибки не объявляются контрактом навечно, но их исправление не маскируется под refactor.

## UI-free проверки: концепция, здесь не выполнялись

Headless основа уже есть: [`tests/test_sim.c`](https://github.com/neoromantic/tower/blob/8d1f452/tests/test_sim.c#L1) содержит native команду линковки `tower/game/people/twr/sound_hook` без SDL и сценарии transport, finance, disaster, save; [`test_spiral_stack.c`](https://github.com/neoromantic/tower/blob/8d1f452/tests/test_spiral_stack.c#L1) проверяет tall-lobby геометрию. Новая тестовая платформа ради выделения не нужна.

Осмысленные дополнения после согласования работ:

- Команда build/add car/demolish/bulk price через публичную границу даёт тот же ledger, topology и rejection, что прежний UI; клад и metro post-build не потеряны.
- Записанный поток команд и ticks даёт совпадающие семантические snapshots/events; разное число render calls и отключённый звук не меняют core после согласованного разделения RNG.
- Два мира в одном процессе, включая `init/load` второго, не меняют TUNING, VIP, routes и таймеры первого. Это проверяет реальную изоляцию, которую текущие structs не обеспечивают.
- Save/load с продолжением нескольких ticks совпадает с непрерывным запуском, включая RNG, queues, VIP и переход календаря; одних сравнений денег и размеров structs недостаточно. Для нового формата одинаковые bytes читаются native/WASM в рамках явно выбранной rules/content revision.
- Pause/decision/edit дают ожидаемую остановку времени и допускают только документированные операции. Snapshot и получение событий не меняют мир; `.TDT` export отдельно проверяется на известные изменения aux data.

Неизвестные, определяющие объём: полный список прямых мутаций `main.c`, точные требования к replay и старым saves, какие cosmetic поля реально нужны новому renderer, допустимость новых RNG последовательностей, правила edit-mode persistence, формат новых content/mechanics. Блокеров для этого исследования нет; для реализации сначала нужен выбор направления. Оценки в днях, проценты переиспользования и benchmarks намеренно не придуманы.
