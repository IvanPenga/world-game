# World Game Engine

A browser-based editor and playtest runtime for top-down 2D tile maps in the style of the old Pokémon games
(Gold / Silver / Crystal). Maps are built from 16×16 tiles on a grid. On top of the tiles you place **entities** —
doors/warps, NPCs, signs, trigger areas, items and ships — that run **scripts** when the player talks to them or steps
on them. Scripts can also open small **mini games** such as password/code panels that pause play until solved. The player has an **inventory**: items lying on the map can be picked up, wood, stone and fruit can be
gathered from resource nodes, NPCs can give items, and the bag shows each item's description. **Ships** moored at the
coast can be boarded and sailed across water. The **Playtest**
button lets you walk around the map you are editing.

Built with React 19, TypeScript, Vite, zustand + immer (editor state), zod (validation) and vitest (tests).

## Getting started

```sh
npm install
npm run dev        # start the editor at http://localhost:5173 (saving to disk needs the dev server)
npm run game       # start only the standalone game at http://localhost:5173
npm test           # run tests in watch mode (npx vitest run for a single run)
npm run lint
npm run build      # type-check and build the editor plus standalone game for production
```

`npm run game` sets `VITE_GAME_ONLY=true` and opens `/`, so the normal app entry renders the standalone game instead
of the editor even if the browser restores the root URL. `npm run dev:game` is also available and opens `/game.html`.

The sample world has eight maps: **Route 1** ([world-map-1.json](src/assets/maps/world-map-1.json)), **House**
([house-1.json](src/assets/maps/house-1.json)), **Whispering Forest** ([forest-1.json](src/assets/maps/forest-1.json)),
**Brookside Town** ([town-1.json](src/assets/maps/town-1.json)), **Brookside Bay**
([sea-1.json](src/assets/maps/sea-1.json)), **Detective Office** ([office-1.json](src/assets/maps/office-1.json)),
**City Block** ([city-1.json](src/assets/maps/city-1.json)) and **Puzzle Lab**
([puzzle-lab-1.json](src/assets/maps/puzzle-lab-1.json)). The route's east exit crosses the forest to the town, and
the town's east road leads to the bay, with return warps each way. City Block is a city texture showcase map, links to
Detective Office and Puzzle Lab, and has a bus that warps to Brookside Town.

- **Route 1** was stripped down by hand and currently only has its east exit and a sign. The house's rug still leads
  to the route, but no warp leads into the house, and the girl there checks the flag `met-old-man`, which no map sets
  any more (the Problems panel reports it).
- **House**: the House Key lies in the top-right corner. **Route 1** has wood and stone to gather. **Forest** has two
  Oran Berries in the north-east corner plus fruit, wood and stone resource nodes. **Town** has a fruit node near its
  south-east homes.
- **Brookside Bay** shows off ships: a pier on the west beach with a rowboat, a step trigger on the water, rocks to
  steer around, **Pearl Isle** (a Pearl to pick up) and **Hermit Isle**, where the hermit gives you the Old Compass
  once (flag `met-hermit`). Both islands can only be reached by boat.
- **City Block** shows the city tiles: roads, sidewalks, building facades and lamp posts, with pedestrians, signs and a
  door into Detective Office, a door into Puzzle Lab and a bus parked on the road that warps the player to Brookside
  Town when they step into its door.
- **Detective Office** shows the office tiles: carpet, interior office walls, computer workstations, desks, chairs and
  filing cabinets, with a detective NPC, case-board notes, client files and an exit back to City Block.
- **Puzzle Lab** is a small interior that demonstrates mini games: read the sticky note for the code, then interact
  with the electrical panel to open a password prompt and reset the board.

## Using the editor

The map is on the left and the control panel on the right. Hovering a tile shows its coordinates, tile names per layer,
walkability and any entities on it below the map. From top to bottom the panel has:

| Section                | What it does                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map list**           | Opens another map and creates new ones (**New map**: id, name, size, tileset, ground fill). See [Maps](#maps).                                                           |
| **Save / Playtest**    | Saves the map and tileset, shows whether there are unsaved changes, and starts a playtest. See [Saving](#saving) and [Playtest](#playtest).                              |
| **Undo / Redo**        | Everything is undoable, including tileset changes. A whole brush drag, a fill or an entity drag is one step.                                                             |
| **Tool**               | **Brush**, **Fill** or **Entities**.                                                                                                                                      |
| **Layers**             | With Brush or Fill: which layer you paint on (ground, decoration, overhead) and which are visible.                                                                        |
| **Tiles**              | The palette. The `✕` swatch is the eraser; it works with both brush and fill.                                                                                             |
| **Entities**           | With the Entities tool: pick a type (warp, npc, sign, trigger, item, resource, ship), click an empty tile to place it, click an entity to select it, drag to move it, and edit it in the form. |
| **View**               | Dim the other layers, show the grid, the collision overlay (red = solid, blue = water) and entities.                                                                     |
| **Map** (collapsed)    | Rename and resize the map. See [Maps](#maps).                                                                                                                             |
| **Tileset** (collapsed)| Every tile in the tileset image. Click one to set its name and collision or to add it to or remove it from the palette. Faded tiles are not in the palette.             |
| **Flags** (collapsed)  | Every flag any map sets or checks, and in which scripts. "never" in yellow means a flag is only set or only checked.                                                     |
| **Problems**           | Warnings from the linter. Click one to select the entity or highlight the tile it is about. See [Problems](#problems).                                                   |

**Brush** paints the selected tile on the active layer by clicking or dragging. **Fill** replaces the clicked tile and
every connected tile (up/down/left/right) with the same id on the active layer.

### Entities and scripts

The entity form edits the entity's properties. **Apply** only applies the change when the whole map is still valid
(for example the entity is inside the map and its id is unique); otherwise the error is shown.

- **Warps** pick their target from the list of existing maps. The form shows the target map's size, and **Go to
  target** opens that map and highlights the target tile. A warp to a map that does not exist stays in the list,
  marked "(does not exist)", and is reported under Problems.
- **NPCs** pick a sprite from the sprite sheet with previews, face the chosen direction and can be `static` or `wander`
  while playing.
- **Items** pick an item from the [item catalog](#item-catalog) and a count; the form shows the item's description.
  New items hold the first item in the catalog. In the editor an item is drawn as a red and white ball with an `I`
  badge.
- **Resources** pick wood, stone or fruit and a count. The player gathers them into the inventory by facing them and
  pressing the interact key. In the editor a resource is drawn as a small pixel-art node with an `R` badge.
- **Ships** only have a facing. Place them on water next to a walkable tile (the coast), so the player can board them.
  They are drawn as a sailing boat with a `B` badge.
- **Scripts** (NPCs, signs, triggers): the **Script** list shows every script in the map and which entities use it.
  Pick an existing script to share it between entities; the form then says which other entities it is shared with,
  because a change applies to all of them. **New script…** creates a script with a new id for this entity. Scripts no
  entity uses any more are removed automatically.
- The script is edited as a list of actions: **Say**, **Set flag**, **Give item**, **Warp**, **Mini game** and **If flag** (with
   nested "then" and "else" lists). **Give item** picks the item from the catalog and shows its description. Actions
  can be moved up and down and removed. **Mini game** opens a password/code prompt with nested success and optional
  failure actions; without failure actions a wrong answer keeps the prompt open for another try. Flag fields suggest the flags the maps already use.
  **Edit as JSON** switches to the raw JSON for pasting or bulk edits, and **Edit as list** switches back (only when
  the JSON is a valid script).

### Maps

- The **map list** shows every map file in `src/assets/maps/`. It is read again each time you open the list, so maps
  added or edited outside the editor show up. Files that are not valid maps are shown as "(invalid file)"; hover them
  to see the error.
- Opening another map while there are unsaved changes asks whether to **Save**, **Don't save** (discard them) or
  **Cancel**.
- **New map** checks that the id is unique and only uses letters, digits, `-` and `_`, because it becomes the file
  name. The new map is "not saved yet" until you save it.
- The **Map** section renames the map and resizes it. **Keep in place** chooses which side stays put (top-left grows
  or shrinks at the right and bottom; the centre grows on all sides). New ground is filled with the chosen tile.
  Entities move with the tiles; triggers are cut to fit; entities that end up outside the map are removed (the form
  lists them before you resize). Resizing is one undo step.
- The map id cannot be changed in the editor, because it is the link between the file and the warps that point to it.

### Saving

**Save** (or `Ctrl/Cmd + S`) writes the map and, if it changed, its tileset back to their JSON files, so the changes
survive a reload and can be committed. Next to the button it says whether there are unsaved changes; undoing back to
the saved state counts as saved again.

- Saving goes through the dev server (`npm run dev`). A Vite plugin
  ([vite-plugins/editor-files-plugin.ts](vite-plugins/editor-files-plugin.ts)) adds a small API:
  `GET /api/maps`, `PUT /api/maps/<id>`, `GET /api/tilesets`, `PUT /api/tilesets/<id>`. It validates with the same
  zod schemas and writes to the file with the same `id`, or to `<id>.json` for a new one. If saving fails, the error
  is shown under the button and the changes stay unsaved.
- Files are written in the same layout as the hand-written ones: 4-space indent, one line per row of tiles for maps
  and one line per tile for tilesets ([src/world-map/map-file.ts](src/world-map/map-file.ts)). That keeps diffs small.
- Saving does not hot-reload the editor, so you keep your undo history and view settings. A file you edit by hand is
  picked up the next time the map list is opened or a map is opened.
- A production build (`npm run build` / `npm run preview`) has no dev server. It starts with the files bundled into
  the build, and **Save** downloads the changed file(s) as `<id>.json` instead.

### Unsaved changes and drafts

- The browser asks before you leave or reload the page with unsaved changes.
- Unsaved changes are also kept as a **draft** in the browser's local storage, half a second after each edit. When you
  open a map that has a draft that differs from the file (for example after a crash or a reload), a yellow banner
  offers to **Restore** it (as an undoable step) or **Discard** it. Drafts are removed when you save or discard.
- A new map that was never saved but has a draft shows up in the map list as "(unsaved draft)".
- The editor remembers the last map you opened and opens it again next time.

### Problems

The Problems section lints the open map against all saved maps and the tileset
([src/world-map/lint.ts](src/world-map/lint.ts)). These are warnings (⚠) and hints (ℹ), not errors: the map can
still be saved.

- walkable areas that no warp leads to (starting from every warp target in any map and the map's own warp tiles). Land
  that a ship can reach counts as reachable: a ship boarded from a reached area reaches every coast of the water it
  sails on
- ships that are not on water, or that have no walkable tile next to them, so nobody can board them
- warps and `warp` actions to maps that do not exist, outside the target map, or onto a solid tile, water, an NPC,
  a sign or an item
- NPCs standing on solid or water tiles, NPCs, signs, items, resources or ships on the same tile, NPC sprites that are not in the
  sprite sheet
- items and resources lying on solid or water tiles, and items (entities, resources or `giveItem` actions) that are not
  in the item catalog or have no name
- step triggers that only cover tiles the player cannot walk on (water counts as reachable when the map has a ship)
- flags that are checked but never set in any map (with a "Did you mean …?" for close names), and flags that are set
  but never checked
- `say` actions with empty text, flags without a name, scripts that do nothing or that no entity uses
- tile ids that are not in the tileset

### Playtest

**▶ Playtest** starts at the tile nearest to the middle of the map that the player can stand on; `P` starts at the
tile under the mouse. The game uses the open map and tileset as they are in the editor, including unsaved changes;
other maps are used as saved.

| Key                    | Action                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Arrow keys / `WASD`    | Walk or sail (hold to keep going)                                                       |
| `Z`, `Space`, `Enter`  | Talk to / read / pick up / gather / board what is in front, next dialogue; go ashore when sailing |
| Text + Submit          | Answer an open mini game                                                                |
| `X`, `I`               | Open or close the bag (inventory)                                                       |
| Up / down (in the bag) | Select an item and read its description                                                 |
| `Escape`               | Back to the editor                                                                      |

The screen is 10 × 9 tiles like the Game Boy Color, with the camera following the player. Solid and water tiles, NPCs,
signs, ships, items that were not picked up yet and resources that were not gathered yet block the way. NPCs with `movement: "wander"` take occasional tile
steps and use their runtime position for collision and interaction. Walking onto a warp fades to the target map. Step
triggers run when you step onto them, interact triggers when you face them and press the interact key, and `once`
triggers only run once.

**Items and the inventory**: face an item and press the interact key to pick it up ("Found Potion!"). It goes into
the inventory and disappears from the map for the rest of the game. A `giveItem` action adds an item the same way
and says "Received Old Map!". The inventory keeps one stack per item, in the order items were first picked up. `X` or
`I` opens the bag, which pauses the game: up and down move the selection (it wraps around, and long lists scroll),
and the box below the list shows the selected item's description. Press `X` or `I` again to close it. The bag only
opens while the player is free to walk, not during a dialogue or a warp.

**Gathering**: face a resource node and press the interact key to gather it. Wood and stone say "Gathered …", fruit
says "Picked …". The resource goes into the inventory, disappears from the map for the rest of the game and no longer
blocks movement. Resources are one-time pickups for now; they do not respawn during a play session.

**Mini games**: scripts can open a password/code prompt. While it is open, movement, sailing, dialogue and the bag are
paused. Correct answers are compared case-insensitively by default (the action can opt into case-sensitive matching),
then the action's success script runs. A wrong answer either keeps the prompt open with feedback or runs the optional
failure script.

**Ships and sailing**: stand on the coast, face a ship and press the interact key to step into it. While sailing,
the arrow keys move the ship tile by tile, over water tiles only (`Water`, `Shore`, `Lily pads`: any tile with
`water` collision); land, solid tiles, rocks, NPCs, signs, items and other ships stop it, and the ship turns to face
the way you steer. To go ashore, press the interact key: if the tile in front is walkable land, you step onto it;
if something is in front (for example a sign on the shore or an item on an island), you talk to it, read it or pick
it up instead; otherwise you step onto any walkable tile next to the ship. The ship stays where you left it for the
rest of the game, and you can board it again from any coast next to it. While sailing, warps do not work (the ship
never sails through a door), but step triggers on water do run. A script `warp` action while sailing leaves the ship
behind and you arrive on foot.

The side panel shows the map, the position (with ", sailing" while on a ship), the flags and the inventory (hover an
item for its description); tick a flag to change it while testing. **Restart** starts over with no flags, an empty
inventory and every ship back where the map puts it. Playtest renders on `requestAnimationFrame` and culls map drawing
to the visible camera area.

### Standalone game

`npm run build` builds both the editor (`index.html`) and a game-only page (`game.html`). `npm run game` runs the same
standalone game component through the root entry by setting `VITE_GAME_ONLY=true`; this avoids accidentally seeing the
editor when the browser opens `/` or restores an old tab. The standalone game bundles the maps, tilesets, sprite sheet
and item catalog, starts on the first bundled map by default, and accepts `?map=<id>` to choose a start map. It has no
editor panel, no saving and no drafts; it starts the player at the nearest walkable tile to the map centre.

### Keyboard shortcuts

| Key                                | Action                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `Ctrl/Cmd + S`                     | Save the map and tileset (also works while typing)      |
| `Ctrl/Cmd + Z`                     | Undo                                                    |
| `Ctrl/Cmd + Shift + Z`, `Ctrl + Y` | Redo                                                    |
| `B` / `F` / `N`                    | Brush / Fill / Entities tool                            |
| `E`                                | Eraser                                                  |
| `1` / `2` / `3`                    | Paint on ground / decoration / overhead                 |
| `D` / `G` / `C`                    | Toggle dim other layers / grid / collision              |
| `P`                                | Playtest from the tile under the mouse                  |
| `Delete`, `Backspace`              | Delete the selected entity (Entities tool only)         |
| `Escape`                           | Deselect the entity and clear the highlighted tile      |

Apart from save, shortcuts are ignored while typing in a form field and while playtesting.

## File formats

Maps, tilesets and the sprite sheet are JSON files, validated with zod when they are loaded
([world-map.ts](src/world-map/world-map.ts), [tileset.ts](src/world-map/tileset.ts),
[sprite-sheet.ts](src/world-map/sprite-sheet.ts)).

### Tileset

One image cut into square tiles. Tile ids start at `1` and count left to right, top to bottom; `0` means "no tile".
Only tiles listed in `tiles` are in the palette. Each tile can have a collision type and an optional animation.

```json
{
    "id": "overworld",
    "image": "/tilesets/overworld.svg",
    "tileSize": 16,
    "columns": 4,
    "tiles": {
        "1": { "name": "Grass" },
        "4": { "name": "Water", "collision": "water", "animation": { "frames": [4, 25], "frameDuration": 450 } }
    }
}
```

The bundled tileset [overworld.json](src/assets/tilesets/overworld.json) /
[overworld.svg](public/tilesets/overworld.svg) has 66 tiles: outdoor ground (grass, tall grass, path, sand, dirt,
cobblestone, snow, ice, water, shore, lily pads, bridge, ledge, cliff), buildings (walls, roof, roof edge, door,
window, city building), town decorations (shop sign, mailbox, chimney, market stall, bench, lamp post), forest decorations (flowers, bush, stump,
mushrooms, fallen log, dark pine, fern patch), other decoration (fence, sign, rock, tree, tree top for the overhead
layer, grave, lamp, fountain, potted plant), city ground (city road, city sidewalk) and indoor tiles/props (stairs, wood floor, indoor wall, rug, blue carpet,
bookshelf, crate, barrel, table, bed, office carpet, office wall, office desk, office chair, filing cabinet and
computer), plus bus tiles (city bus and bus door). Tile 25 is a water-ripple frame used by tile 4's animation.

### Sprite sheet

Character sprites in one image: one row per sprite, one column per facing, each frame `frameSize` pixels. NPCs refer
to a sprite by its id. The player is drawn with the detective sprite `player`.

```json
{
    "image": "/sprites/characters.svg",
    "frameSize": 16,
    "facings": ["down", "up", "left", "right"],
    "sprites": ["player", "npc", "old-man", "girl", "boy", "nurse", "shopkeeper", "guard", "fisherman", "hiker", "scientist", "creature", "mayor", "merchant", "child", "farmer", "pet", "cook"]
}
```

The tileset and sprite images are pixel art generated by [tools/generate-art.py](tools/generate-art.py) from pixel
grids in the script (`python3 tools/generate-art.py [--preview DIR]`). It overwrites both SVGs and both JSON files.
Tile ids are positions in the image and maps store tile ids, so only ever add tiles at the end. The script writes
`overworld.json` too, so a tile name or collision changed in the editor must also be changed in the script, or it
is lost the next time the script runs.

### Item catalog

Every item the player can carry, in [items.json](src/assets/items/items.json). Items are shared by all maps, like
flags, and maps refer to them by `id`. The editor only reads the catalog; add or change items by editing the file
(the order is the order the editor lists them in). Ids must be unique.

```json
{
    "items": [
        { "id": "potion", "name": "Potion", "description": "A spray bottle of medicine. Smells faintly of mint." },
        { "id": "wood", "name": "Wood", "description": "A sturdy piece of timber gathered from fallen branches and old logs." }
    ]
}
```

### Map

```jsonc
{
    "id": "route-1",
    "name": "Route 1",
    "width": 20,
    "height": 20,
    "tilesetId": "overworld",
    "layers": {
        "ground": [/* width × height tile ids, row by row: index = y * width + x */],
        "decoration": [/* ... */],
        "overhead": [/* drawn above the player, e.g. tree tops and roofs */]
    },
    "entities": [
        { "type": "warp", "id": "house-door", "x": 6, "y": 6, "target": { "mapId": "house-1", "x": 3, "y": 7 } },
        { "type": "npc", "id": "old-man", "x": 12, "y": 8, "sprite": "old-man", "facing": "down", "movement": "static", "script": "old-man-talk" },
        { "type": "sign", "id": "route-sign", "x": 9, "y": 11, "script": "route-sign" },
        { "type": "trigger", "id": "grass-warning", "x": 3, "y": 12, "width": 4, "height": 1, "on": "step", "script": "grass-warning", "once": true },
        { "type": "item", "id": "route-potion", "x": 2, "y": 17, "item": "potion" },
        { "type": "resource", "id": "forest-wood", "x": 10, "y": 8, "resource": "wood", "count": 2 },
        { "type": "ship", "id": "rowboat", "x": 14, "y": 13, "facing": "right" }
    ],
    "scripts": {
        "old-man-talk": [
            {
                "type": "if",
                "flag": "met-old-man",
                "then": [{ "type": "say", "text": "Be careful out there!" }],
                "else": [
                    { "type": "say", "text": "Hello, young traveller!" },
            { "type": "giveItem", "item": "old-map" },
            {
                "type": "miniGame",
                "miniGame": {
                    "type": "password",
                    "title": "Electrical board",
                    "prompt": "Enter the reset code.",
                    "answer": "sparks",
                    "success": [{ "type": "setFlag", "flag": "board-reset", "value": true }]
                }
            },
            { "type": "setFlag", "flag": "met-old-man", "value": true }
                ]
            }
        ]
    }
}
```

- **Entities**: `warp` (door, stairs or map edge → a tile in another map), `npc`, `sign`, `trigger` (an area that
  runs a script when stepped on or interacted with, optionally only once), `item` (an item from the catalog lying on
  the map, picked up once; `count` defaults to 1), `resource` (wood, stone or fruit gathered once into the inventory;
  `count` defaults to 1) and `ship` (a boat on water the player can board; `facing` is the way it points at the start).
- **Scripts** are lists of actions, so behaviour is data rather than code: `say`, `setFlag`, `giveItem` (add
  `count`, default 1, of an item to the inventory), `warp`, `miniGame` (currently a password/code prompt with success
  and optional failure actions) and `if` (branch on a flag). Several entities can share a script. **Flags** are global: a flag set in one map can be checked in another.
- **Collision** comes from the tileset. The ground and decoration layers can block movement; `solid` wins over
  `water`; the overhead layer never blocks; outside the map is solid. NPCs, signs, items, resources and ships also block the player
  ([collision.ts](src/world-map/collision.ts)).
- **Validation** checks that every layer has `width × height` tiles, entities are inside the map, entity ids are
  unique and every script an entity uses exists. Things that are allowed but probably wrong are reported by the
  linter instead (see [Problems](#problems)).

## Project structure

```
src/
  world-map/     Data model shared by the editor and the game, no React:
                   world-map.ts (map schema, helpers, flood fill), tileset.ts, sprite-sheet.ts, items.ts (item catalog),
                   collision.ts, entities.ts (defaults, unique ids), scripts.ts (flags, warp targets, script users),
                   resize.ts, lint.ts (problems), map-file.ts (JSON file formatting)
  game/          game-state.ts: the playtest runtime as pure functions (movement, interaction, script
                     interpreter, dialogue, mini games, warps, flags, inventory and the bag menu, resources, ships and sailing), driven by
                   updateGame(state, world, input, delta);
                   bundled-world.ts loads JSON assets for the standalone game
  rendering/     Canvas drawing (map-renderer.ts: tiles, grid, collision, entities, sprites, item balls, ships), no
                   React;
                    use-image.ts loads images, use-raster-image.ts turns SVGs into canvases for faster drawing
  editor/        editor-store.ts (zustand + immer: map, tileset, history, saving, opening maps, drafts),
                   editor.ts (the app-wide store: loads the files, keeps drafts), repository.ts (dev-server API
                   or bundled files), bundled-files.ts (production only), drafts.ts (localStorage),
                   shortcuts, hooks for problems and flags, palette styles
  components/    React UI: map canvas, control panel and its sections, entity form, script editor,
                   dialogs, playtest view, inventory-menu.tsx and minigame-overlay.tsx (overlays used by both game views)
  main.tsx        App entry; renders the editor by default, or StandaloneGame when VITE_GAME_ONLY=true
  game-main.tsx   Game-only entry used by game.html in production and by npm run dev:game
  standalone-game.tsx: standalone game page shared by main.tsx game-only mode and game-main.tsx
  assets/        Map, tileset, sprite sheet and item catalog JSON (maps/, tilesets/, sprites/, items/)
public/          Tileset and sprite sheet images (tilesets/overworld.svg, sprites/characters.svg)
vite-plugins/    editor-files-plugin.ts: dev-server API that lists and saves maps and tilesets
tools/           generate-art.py: generates the tileset and sprite sheet images and JSON
```

Tests live next to the code as `*.test.ts` and cover the schemas and validation, map helpers, flood fill, collision,
entities, scripts, resizing, linting, file formatting (including an exact round trip of the bundled files), the item
catalog, the renderer, the game runtime (including pickups, `giveItem`, mini games, the bag menu and sailing) and the editor store
(painting, strokes, fill, undo/redo, entity editing, tileset edits, saving, opening maps, drafts, resizing).

## What has been done so far

1. **Project setup**: Vite + React 19 + TypeScript, ESLint + Prettier. Added zustand, immer and vitest.
2. **Data model**: a layered tile map (ground, decoration, overhead), a tileset with per-tile collision, entities and
   scripts, all validated with zod.
3. **Canvas renderer**: the map is drawn on a single `<canvas>` with pixel-perfect scaling (×3) and high-DPI support.
4. **Painting tools**: brush, flood fill, eraser; one undo step per stroke; keyboard shortcuts.
5. **Layers and collision view**: show/hide and dim layers, collision overlay, entity visibility.
6. **Entity editing**: place, select, drag and delete warps, NPCs, signs and triggers, with validation; undoable.
7. **Saving**: Save and `Ctrl/Cmd + S` write files through a dev-server plugin; unsaved-changes indicator and
   leave-page warning; production builds download the file.
8. **Multiple maps**: map list, opening maps with a save / don't save / cancel prompt, new maps, rename and resize.
9. **Warp targets**: picked from existing maps, checked against their size, with "Go to target".
10. **Tileset**: a real 66-tile pixel-art tileset with animated water, and a tileset editor for names, collision and
      the palette, saved like maps.
11. **Scripts**: a structured script editor (with a JSON mode), shared scripts, and a flag overview across all maps.
12. **NPC sprites**: an 18-character sprite sheet; NPCs are drawn with their sprite and facing.
13. **Drafts**: unsaved changes are kept in local storage and can be restored after a crash or reload.
14. **Problems**: a linter for reachability, warps, NPC placement, triggers, flags, scripts and tiles.
15. **Playtest**: walk the map with tile-by-tile movement, collision, a following camera, dialogue, scripts, flags,
    triggers, wandering NPCs, animated tiles and warps with a fade.
16. **Standalone game**: a `game.html` build entry that runs the bundled world without the editor and supports
    `?map=<id>` for the start map.
17. **Rendering performance**: SVG tilesets and sprites are rasterized once before repeated canvas drawing, and the
    playtest / standalone game draw only the visible camera viewport instead of the whole map.
18. **Expanded sample world**: Route 1 now connects east to Whispering Forest, which connects east to Brookside Town.
    The new maps are plain asset JSON: forest and town layout, warps, signs, triggers, NPCs and dialogue scripts.
19. **Expanded art set**: `tools/generate-art.py` now generates a detective player sprite, extra town sprites
    (`mayor`, `merchant`, `child`, `farmer`, `pet`, `cook`), town tiles (`Shop sign`, `Mailbox`, `Chimney`,
    `Market stall`, `Bench`) and forest tiles (`Mushrooms`, `Fallen log`, `Dark pine`, `Fern patch`). These were
    appended as tile ids 46-54 so existing map tile ids stayed stable.
20. **Editor panel cleanup**: the control panel groups save/history, paint and entity editing controls more clearly;
    selected entity forms are split into focused sections, and NPC sprite selection shows clickable previews.
21. **Items and inventory**: an item catalog with names and descriptions, `item` entities the player picks up, a
    `giveItem` script action, an inventory in the game state, a bag menu (`X` / `I`) that shows the selected item's
    description, an inventory list in the playtest panel, lint checks for items, and sample items on the route, in
    the house and in the forest.
22. **Ships and sailing**: a `ship` entity, boarding from the coast and going ashore with the interact key, sailing
    on water tiles, ship positions kept at runtime, the player drawn sitting in the boat, ship-aware reachability and
    lint checks, and the new **Brookside Bay** map east of the town with two islands only reachable by boat.
23. **Gathering**: a `resource` entity for wood, stone and fruit, resource pixel art, editor fields, runtime gathering
    into the inventory, disappearing gathered resources, collision and lint checks.
24. **Detective office sample**: office carpet, wall and furniture tiles were appended as tile ids 55-60, and
    `office-1` uses them for a detective office map with a desk area, interview table, case-board notes, NPC dialogue
    and an exit warp.
25. **City sample**: city road, sidewalk, building and lamp post tiles were appended as tile ids 61-64, and `city-1`
    uses them for a city block map with street-side buildings, pedestrians, signs and a door into the detective office.
26. **Bus travel sample**: city bus and bus door tiles were appended as tile ids 65-66. `city-1` places a bus on the
    road, and its walkable door tile has a warp that sends the player to Brookside Town.
27. **Mini games**: scripts can open password/code prompts from any scriptable entity, pause the game while the player
    answers, and run nested success or failure actions.
28. **Puzzle Lab sample**: `puzzle-lab-1` connects from City Block and demonstrates an electrical-board password mini
    game with a nearby clue, success flag and solved-state dialogue.

## Roadmap

- **Small**: eyedropper; show tile ids in hover info; delete maps from the editor; make animation fields editable in
  the tileset panel.
- **Medium**: zoom and pan; rectangle and line tools; copy/paste and multi-tile stamps; pick warp targets by clicking
  on the target map; walking animation frames; walking routes for NPCs.
- **Sea**: more sea maps and islands; sea-to-sea warps that keep the player on the ship (warps are ignored while
  sailing today); a `sailing` condition for scripts; ships that need an item (e.g. a ticket) to board; bigger ships
  with their own sprite sheet row; a dedicated coast/shore auto-tile.
- **Items**: an `ifItem` script action (branch on having an item) and `takeItem` (remove one), so items can open doors
  or finish quests; using items from the bag; an item catalog editor in the editor panel; an icon per item.
- **Resources**: resource respawn rules; resource-specific tools; crafting recipes that consume wood, stone and fruit.
- **Mini games**: more puzzle types beyond password/code prompts; puzzle-specific visual layouts; using inventory items
  inside a puzzle.
- **Large**: auto-tiling for paths, water edges and cliffs; more script actions (move NPC, choices); music
  per map; save conflict detection; saving the game (flags, inventory, picked-up items).

## Known limitations

- Saving to disk only works while `npm run dev` is running.
- If the same map is open in two tabs, the last save wins; there is no conflict detection.
- The map id cannot be renamed in the editor, and maps cannot be deleted from it (delete the file instead).
- Playtesting uses the saved version of other maps, not their drafts.
- Characters have a single frame per facing; walking is shown with a small hop.
- Wandering NPCs choose simple deterministic steps, not authored routes.
- The linter checks warp landing tiles in other maps only against their saved version.
- The item catalog cannot be edited in the editor; edit `src/assets/items/items.json` by hand.
- Items and resources can be collected and read, but not used, dropped or checked in scripts yet. The inventory is not kept when the
  game is closed or restarted.
- Gathered resources do not respawn until Restart or a new game state.
- Every item lying on the map is drawn as the same ball, and every ship as the same boat (pixel art in
  `map-renderer.ts`, not in the sprite sheet).
- Ship positions are runtime state only: they reset on Restart and are not saved. A ship left where no coast is
  next to it could strand the player's way back (the map author has to avoid dead ends).
- Warps do nothing while sailing, so a ship cannot sail from one map to another.
- Reachability lint treats a ship as usable from wherever it starts; it does not follow where the player leaves it.
- Mini games currently support only password/code prompts, not grid, wiring or inventory-based puzzle UIs.

## Notes for future agents

- There is no git repository here. Do not initialize one unless explicitly asked.
- Keep this README current whenever behaviour, formats, project structure, roadmap or limitations change.
- Before finishing code changes, run `npx vitest run`, `npm run lint`, `npx tsc -b` and
  `npx prettier --check src vite-plugins vite.config.ts`. For build-entry changes, also run `npm run build`.
- Do not run Prettier on `src/assets/`; map and tileset JSON have custom formatting checked by tests.
- The standalone game has two ways to run: `npm run game` renders `StandaloneGame` from `src/main.tsx` using
  `VITE_GAME_ONLY=true`, while `/game.html` uses `src/game-main.tsx`. Keep both paths working when changing game code.
- Runtime NPC movement lives in `src/game/game-state.ts` as `state.npcs`; it must not mutate map entities. Use
  `getNpcState` and `getNpcPosition` for drawing, collision and interaction with wandering NPCs.
- Animated tiles are data-driven through `TileDefinition.animation` in `src/world-map/tileset.ts`. Rendering resolves
  frames in `drawMap` via `getAnimatedTileId`; collision still comes from the base tile id placed on the map.
- The bundled overworld art is generated by `tools/generate-art.py`. Tile 25 is the water-ripple frame for tile 4.
  Only add tile ids at the end because maps store numeric ids.
- If you add generated art, update `tools/generate-art.py` first, then run `python3 tools/generate-art.py` so the SVG
  files and JSON asset manifests stay in sync. Also update `src/world-map/tileset.test.ts` if the bundled tile count
  changes.
- The current connected world path is `route-1` -> `forest-1` -> `town-1` -> `sea-1`, with return warps in each
  direction. `city-1` and `office-1` link to each other as a separate showcase pair. Keep warp targets on walkable,
  non-blocked tiles; signs, NPCs, items and ships block movement.
- Game-state rules for what is "in the way" live in one place: `isEntityInTheWay` in `game-state.ts`. Walking
  (`canPlayerStandOn`), NPC wandering (`canNpcStandOn`) and sailing (`canSailOn`) all use it; a new blocking entity
  type should be added there too, as well as to `isBlockingEntity` in `collision.ts` (used by the editor and lint).
- Sailing state: `state.sailing` is the sailed ship's `"<mapId>/<shipId>"` key or null; `state.ships` holds runtime
  positions of ships that were ever boarded; the player's position is the ship's position while sailing.
  `player.step.boarding` marks the step onto the ship, during which the ship does not move. Use `getShipState` and
  `getShipPosition` to draw or query ships, never the map entity's `x` / `y`.
- Both game views (`playtest-view.tsx` and `standalone-game.tsx`) duplicate the canvas drawing code: items, ships, the
  player and the hull drawn over a sailing player. Change both when drawing changes.
- New sample maps were generated with a Node script that imports `map-file.ts` and `world-map.ts` directly (Node 24
  strips TypeScript types) and writes through `serializeWorldMap`, so the file layout matches the editor's. Use the
  same approach (or the editor) rather than hand-writing layers.
- Use tile 19 (`Tree top`) only for actual tree canopy on the overhead layer. Do not use it as a roof overlay or at map
  exits; town roofs should rely on ground/decoration roof tiles unless a dedicated roof-overhead tile is added later.
- The tileset editor preserves existing `animation` fields when editing name/collision, but it does not yet expose UI
  controls to create or edit animations.
