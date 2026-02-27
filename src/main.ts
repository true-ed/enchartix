// main.ts
import { Plugin } from 'obsidian';
import { EnchartixGraph } from './EnchartixCore';

declare global {
    interface Window {
        EnchartixGraph?: typeof EnchartixGraph;
    }
}

export default class EnchartixPlugin extends Plugin {
    onload() {
        console.debug('🔮 Enchartix 3D Graph loaded!');
        window.EnchartixGraph = EnchartixGraph;
    }

    onunload() {
        console.debug('🛑 Enchartix 3D Graph unloaded!');
        delete window.EnchartixGraph;
    }
}