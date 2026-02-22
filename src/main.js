import { EnchartixGraph } from './EnchartixCore.js';

// ==================================================================================
// 🏋️‍♂️ GRAPH 1: FITNESS DATA (DARK THEME)
// ==================================================================================

const mockFitnessData = [
    {
        name: "Pull-ups (Back)",
        entries: [
            { sets: [], date: "Start" },
            { sets: [5, 5, 4], date: "2026.02.01" },
            { sets: [6, 5, 5], date: "2026.02.04" },
            { sets: [7, 6, 5, 4], date: "2026.02.08" },
            { sets: [8, 7, 5, 5], date: "2026.02.12" },
            { sets: [8, 8, 6, 5, 4], date: "2026.02.15" },
            { sets: [10, 8, 6, 5], date: "2026.02.22" },
            { sets: [12, 10, 8, 6, 5], date: "2026.03.02" }
        ]
    },
    {
        name: "Push-ups (Chest)",
        entries: [
            { sets: [], date: "Start" },
            { sets: [15, 12, 10], date: "2026.02.02" },
            { sets: [20, 15, 12], date: "2026.02.05" },
            { sets: [22, 18, 15, 10], date: "2026.02.09" },
            { sets: [25, 20, 15, 12], date: "2026.02.16" },
            { sets: [30, 25, 20], date: "2026.02.25 Morning" },
            { sets: [15, 15, 10], date: "2026.02.25 Evening" },
        ]
    },
    {
        name: "Weighted Squats",
        entries: [
            { sets: [], date: "Start" },
            { sets: [50], date: "2026.02.10" },
            { sets: [60, 50], date: "2026.02.18" },
            { sets: [70, 60, 50], date: "2026.02.28" }
        ]
    }
];

const mockEngData = [
    {
        // Metrics: Number of new words learned that day
        name: "New Vocabulary (Words)",
        entries: [
            { sets: [], date: "Start" },
            { sets: [15], date: "2026.02.01 Mon" },
            // Example of reviewing words twice a day
            { sets: [10, 5], date: "2026.02.02 Tue (Review)" },
            { sets: [20], date: "2026.02.04 Thu" },
            // Intense weekend study session split into chunks
            { sets: [15, 10, 15], date: "2026.02.07 Sun (Intensive)" },
            { sets: [12], date: "2026.02.10 Tue" },
            { sets: [25], date: "2026.02.15 Sun" },
            { sets: [30], date: "2026.02.22 Sun" }
        ]
    },
    {
        // Metrics: Minutes spent studying
        name: "Study Time (Minutes)",
        entries: [
            { sets: [], date: "Start" },
            { sets: [45], date: "2026.02.01 Mon" },
            { sets: [30, 20], date: "2026.02.02 Tue" },
            { sets: [60], date: "2026.02.05 Fri" },
            { sets: [90], date: "2026.02.07 Sun" },
            { sets: [45], date: "2026.02.12 Thu" },
            // A very long session broken down by topics maybe?
            { sets: [60, 45, 30], date: "2026.02.18 Wed (Grammar+Reading)" },
            { sets: [20], date: "2026.02.20 Fri (Quick Review)" }
        ]
    },
    {
        // Metrics: Pages read in a book (slower progression)
        name: "Pages Read (Harry Potter)",
        entries: [
            { sets: [], date: "Start" },
            { sets: [5], date: "2026.02.05 Fri" },
            { sets: [12], date: "2026.02.07 Sun" },
            { sets: [8], date: "2026.02.14 Sat" },
            { sets: [15], date: "2026.02.21 Sat" },
            { sets: [22], date: "2026.02.28 Sat" }
        ]
    }
];
// ==========================================
// 🚀 INITIALIZATION 1: FITNESS (DARK)
// ==========================================

const graphLabels = {
    viewToggle2D: "2D Flat View",
    viewToggle3D: "3D Perspective",
    tooltipNoteTotal: "Entry Total",
    tooltipCumulative: "Overall Progress"
};

const fitnessContainer = document.getElementById('graph-container');
let fitGraph;

if (fitnessContainer) {
    fitGraph = new EnchartixGraph(fitnessContainer, mockFitnessData, {
        themeColor: "#7d33ff",
        isDark: true,
        labels: graphLabels
    });

    document.getElementById('fit-color').addEventListener('input', (e) => {
        fitGraph.updateThemeColor(e.target.value);
    });
}

const engContainer = document.getElementById('eng-graph-container');
let engGraph;

if (engContainer) {
    engGraph = new EnchartixGraph(engContainer, mockEngData, {
        themeColor: "#00b894",
        isDark: false,
        labels: graphLabels
    });

    document.getElementById('eng-color').addEventListener('input', (e) => {
        engGraph.updateThemeColor(e.target.value);
    });
}

// =================================================================
// ⌨️ GLOBAL EVENTS (Demo Level)
// =================================================================

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's' && e.target.tagName !== 'INPUT') {

        if (fitGraph) {
            fitGraph.downloadScreenshot('fitness-tracker-3d.png');
            console.log("📸 Fitness screenshot downloaded!");
        }

        if (engGraph) {
            setTimeout(() => {
                engGraph.downloadScreenshot('english-progress-3d.png');
                console.log("📸 English screenshot downloaded!");
            }, 300);
        }
    }
});