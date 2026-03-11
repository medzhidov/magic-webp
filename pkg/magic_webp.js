/* @ts-self-types="./magic_webp.d.ts" */

import * as wasm from "./magic_webp_bg.wasm";
import { __wbg_set_wasm } from "./magic_webp_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    ProcessResult, crop, init_panic_hook, resize, resize_fit
} from "./magic_webp_bg.js";
export { wasm as __wasm }
