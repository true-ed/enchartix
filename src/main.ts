import { Plugin } from "obsidian";
import { EnchartixGraph } from "./core/EnchartixGraph";

declare global {
	interface Window {
		EnchartixGraph?: typeof EnchartixGraph;
	}
}

export default class EnchartixPlugin extends Plugin {
	private activeGraphs: EnchartixGraph[] = [];

	override onload(): void {
		activeWindow.EnchartixGraph = EnchartixGraph;
	}

	override onunload(): void {
		this.activeGraphs.forEach((g) => g.destroy());
		this.activeGraphs = [];
		delete activeWindow.EnchartixGraph;
	}
}