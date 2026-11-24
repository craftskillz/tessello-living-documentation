// The Widget: the Active Project's name and its favorites; a click on one opens the View on that Document (View params).

import { connect } from "@tessello/sdk";
import { mount } from "svelte";
import { setLocale } from "../lib/i18n.ts";
import "../lib/base.css";
import { applyTheme } from "../lib/theme.ts";
import Widget from "./Widget.svelte";

const host = await connect();
setLocale(host.context.locale);
document.documentElement.lang = host.context.locale;
applyTheme(host.context.theme);
host.onThemeChange(applyTheme);

mount(Widget, { target: document.body, props: { host } });
