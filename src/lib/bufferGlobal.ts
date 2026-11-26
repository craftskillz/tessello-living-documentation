// isomorphic-git needs a global `Buffer`, which the browser lacks: import this module before it.

import { Buffer } from "buffer";

globalThis.Buffer ??= Buffer;
