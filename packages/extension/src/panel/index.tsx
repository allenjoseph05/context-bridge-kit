// Side panel entry: renders the panel against the real native host.
import { render } from "preact";
import { chromeNativeClient } from "../native.js";
import { Panel } from "./Panel.js";

const root = document.getElementById("app");
if (root) render(<Panel client={chromeNativeClient()} />, root);
