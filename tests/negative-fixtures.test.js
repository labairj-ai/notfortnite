import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
for (const [name, source] of Object.entries({
  determinism:
    "import {createWorld} from './shared/worldgen.js';assert.deepEqual(createWorld(1).chests,createWorld(2).chests)",
  inventory:
    "import {newInventory,dropItem} from './shared/inventory.js';assert.equal(dropItem(newInventory(),0).ok,true)",
  collision:
    "import {rayBox} from './shared/geometry.js';assert.equal(rayBox({x:0,y:0,z:0},{x:0,y:0,z:1},{x:-1,y:-1,z:2},{x:1,y:1,z:3},1),2)",
  controls:
    "import {createControls} from './src/controls.js';const w=new EventTarget(),d=new EventTarget();d.getElementById=()=>null;globalThis.window=w;globalThis.document=d;const c=createControls(new EventTarget());c.fire=true;c.resetInputs();assert.equal(c.fire,true)",
}))
  test("deliberately failing " + name + " fixture exits nonzero", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import assert from 'node:assert/strict';" + source,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /AssertionError/);
  });
