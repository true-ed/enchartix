import { Plugin } from 'obsidian';
import { EnchartixGraph } from './EnchartixCore';

export default class EnchartixPlugin extends Plugin {
    async onload() {
        console.log('🔮 Enchartix 3D Graph loaded!');
        (window as any).EnchartixGraph = EnchartixGraph;
    }

    onunload() {
        console.log('🛑 Enchartix 3D Graph unloaded!');
        delete (window as any).EnchartixGraph;
    }
}