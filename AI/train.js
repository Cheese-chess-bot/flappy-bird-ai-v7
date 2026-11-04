
"use strict";

const E = window.FlappyEngine;

if (!E || typeof E.step !== "function") {
    throw new Error("Load ../shared/engine.js before train.js");
}

const POPULATION = 100;
const MAX_FRAMES = 100000;
const TURBO_BATCH = 500;
const WATCH_BATCH = 1;
const ELITES = 5;

const SAVE_KEY = "flappy-engine-v4-champion";
const OLD_SAVE_KEY = "flappy-best-brain-v3";

const canvas = document.getElementById("trainingCanvas");
const ctx = canvas.getContext("2d");

const CONFIG = {
    width: 420,
    height: 420,
    seed: 12345,
    gravity: 0.25,
    jumpForce: -4.6,
    pipeGap: 90,
    pipeWidth: 52,
    pipeSpawnX: 360,
    pipeSpeed: 1000 / 450,
    pipeInterval: 84,
    firstPipeFrame: 1,
    jumpCooldown: 9
};

let world = null;
let brains = [];
let generation = 1;
let totalFrames = 0;
let running = false;
let turbo = false;
let animationId = null;

let bestBrain = null;
let bestScore = 0;
let bestFitness = -Infinity;
let bestGeneration = 0;
let trainingHistory = [];

function randomWeight() {
    return Math.random() * 2 - 1;
}

function createBrain() {
    return Array.from({ length: 57 }, randomWeight);
}

function mutate(brain, rate = 0.2, strength = 0.5) {
    return brain.map(weight => {
        if (Math.random() < rate) {
            return weight + randomWeight() * strength;
        }

        return weight;
    });
}

function crossover(first, second) {
    return first.map((weight, index) => {
        return Math.random() < 0.5
            ? weight
            : second[index];
    });
}

function createPopulation() {
    return Array.from(
        { length: POPULATION },
        createBrain
    );
}

function getSeed() {
    const group = Math.floor((generation - 1) / 5);

    return (
        12345 + Math.imul(group, 7919)
    ) >>> 0;
}

function createTrainingWorld() {
    world = E.createWorld({
        ...CONFIG,
        seed: getSeed()
    });

    E.addBirds(world, POPULATION, "ai");
}

function getModel() {
    return {
        type: "flappy-neuroevolution",
        version: 4,
        engine: "shared-v4",
        inputs: 5,
        hidden: 8,
        weights: bestBrain,
        score: bestScore,
        fitness: bestFitness,
        generation: bestGeneration,
        physics: {
            gravity: CONFIG.gravity,
            jump: CONFIG.jumpForce,
            gap: CONFIG.pipeGap,
            pipeSpeed: CONFIG.pipeSpeed,
            pipeInterval: CONFIG.pipeInterval
        }
    };
}

function saveBestBrain() {
    if (!bestBrain) {
        return;
    }

    try {
        localStorage.setItem(
            SAVE_KEY,
            JSON.stringify(getModel())
        );
    } catch (error) {
        log("Storage failed. Export your champion.");
    }
}

function loadModel(key) {
    try {
        const text = localStorage.getItem(key);

        if (!text) {
            return null;
        }

        const model = JSON.parse(text);

        return E.validateModel(model)
            ? model
            : null;
    } catch (error) {
        return null;
    }
}

function initializeBrains() {
    brains = createPopulation();

    const savedV4 = loadModel(SAVE_KEY);
    const savedV3 = loadModel(OLD_SAVE_KEY);

    if (savedV4) {
        bestBrain = [...savedV4.weights];
        bestScore = savedV4.score || 0;
        bestFitness = savedV4.fitness || 0;
        bestGeneration = savedV4.generation || 0;

        brains[0] = [...bestBrain];

        for (let i = 1; i < 30; i++) {
            brains[i] = mutate(bestBrain, 0.35);
        }

        log("V4 champion restored.");

        return;
    }

    if (savedV3) {
        brains[0] = [...savedV3.weights];

        for (let i = 1; i < 40; i++) {
            brains[i] = mutate(
                savedV3.weights,
                0.3,
                0.45
            );
        }

        log("V3 champion imported as a training candidate.");
        log("Its old score will be evaluated under V4 physics.");

        return;
    }

    log("Starting with 100 random neural networks.");
}

function getActions() {
    const actions = {};

    for (let i = 0; i < world.birds.length; i++) {
        const bird = world.birds[i];

        if (!bird.alive) {
            continue;
        }

        const model = {
            type: "flappy-neuroevolution",
            inputs: 5,
            hidden: 8,
            weights: brains[i]
        };

        actions[bird.id] = E.modelAction(
            world,
            bird,
            model
        );
    }

    return actions;
}

function calculateFitness(bird) {
    return bird.score * 10000 + bird.frames;
}

function rankPopulation() {
    return world.birds.map((bird, index) => {
        return {
            index: index,
            brain: brains[index],
            score: bird.score,
            frames: bird.frames,
            fitness: calculateFitness(bird)
        };
    }).sort((a, b) => {
        return b.fitness - a.fitness;
    });
}

function chooseParent(ranked) {
    const limit = Math.min(15, ranked.length);
    const index = Math.floor(Math.random() * limit);

    return ranked[index].brain;
}

function breedNextGeneration(ranked) {
    const next = [];

    for (let i = 0; i < ELITES; i++) {
        next.push([...ranked[i].brain]);
    }

    while (next.length < POPULATION) {
        if (Math.random() < 0.05) {
            next.push(createBrain());
            continue;
        }

        const parentA = chooseParent(ranked);
        const parentB = chooseParent(ranked);

        const child = crossover(parentA, parentB);

        next.push(mutate(child));
    }

    if (bestBrain) {
        next[0] = [...bestBrain];
    }

    return next;
}

function finishGeneration() {
    const ranked = rankPopulation();
    const winner = ranked[0];

    if (winner.fitness > bestFitness) {
        bestFitness = winner.fitness;
        bestScore = winner.score;
        bestGeneration = generation;
        bestBrain = [...winner.brain];

        saveBestBrain();
    }

    trainingHistory.push({
        generation: generation,
        seed: world.seed,
        score: winner.score,
        frames: winner.frames,
        fitness: winner.fitness
    });

    log(
        "GEN " + generation +
        " | SEED " + world.seed +
        " | SCORE " + winner.score +
        " | FRAMES " + winner.frames +
        " | FITNESS " + winner.fitness
    );

    brains = breedNextGeneration(ranked);
    generation++;

    createTrainingWorld();
}

function simulateFrame() {
    const actions = getActions();

    E.step(world, actions);

    totalFrames++;

    const alive = E.getAliveCount(world);

    if (
        alive === 0 ||
        world.frame >= MAX_FRAMES
    ) {
        finishGeneration();
    }
}

function getCurrentLeader() {
    let leader = null;

    for (const bird of world.birds) {
        if (
            !leader ||
            bird.score > leader.score ||
            (
                bird.score === leader.score &&
                bird.frames > leader.frames
            )
        ) {
            leader = bird;
        }
    }

    return leader;
}

function getLeadingAliveBird() {
    let leader = null;

    for (const bird of world.birds) {
        if (!bird.alive) {
            continue;
        }

        if (
            !leader ||
            bird.score > leader.score ||
            (
                bird.score === leader.score &&
                bird.frames > leader.frames
            )
        ) {
            leader = bird;
        }
    }

    return leader;
}

function drawBackground() {
    ctx.fillStyle = "#4ec0ca";
    ctx.fillRect(0, 0, 420, 420);

    ctx.fillStyle = "#c5edf3";
    ctx.fillRect(0, 345, 420, 60);

    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, 405, 420, 15);
}

function drawPipe(pipe) {
    const x = pipe.x;
    const top = pipe.top;
    const bottom = pipe.bottom;

    ctx.fillStyle = "#58c943";
    ctx.strokeStyle = "#245c24";
    ctx.lineWidth = 2;

    ctx.fillRect(x, 0, 52, top);
    ctx.strokeRect(x, 0, 52, top);

    ctx.fillRect(x, bottom, 52, 420 - bottom);
    ctx.strokeRect(x, bottom, 52, 420 - bottom);

    ctx.fillStyle = "#76e052";

    ctx.fillRect(x - 3, top - 24, 58, 24);
    ctx.strokeRect(x - 3, top - 24, 58, 24);

    ctx.fillRect(x - 3, bottom, 58, 24);
    ctx.strokeRect(x - 3, bottom, 58, 24);
}

function drawBird(bird, color) {
    ctx.fillStyle = color;

    ctx.beginPath();

    ctx.ellipse(
        bird.x + 17,
        bird.y + 12,
        16,
        11,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();
}

function drawBirds() {
    const leader = getLeadingAliveBird();

    ctx.globalAlpha = 0.25;

    for (const bird of world.birds) {
        if (bird.alive && bird !== leader) {
            drawBird(bird, "#ffd84d");
        }
    }

    ctx.globalAlpha = 1;

    if (leader) {
        drawBird(leader, "#ff48a5");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(leader.x + 23, leader.y + 5, 6, 6);

        ctx.fillStyle = "#111111";
        ctx.fillRect(leader.x + 26, leader.y + 7, 2, 2);
    }
}

function drawHUD() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, 420, 34);

    ctx.fillStyle = "#ffffff";
    ctx.font = "13px Consolas";

    ctx.fillText("GEN " + generation, 10, 22);

    ctx.fillText(
        "ALIVE " + E.getAliveCount(world),
        130,
        22
    );

    const leader = getCurrentLeader();

    ctx.fillText(
        "SCORE " + (leader ? leader.score : 0),
        280,
        22
    );
}

function renderGame() {
    ctx.clearRect(0, 0, 420, 420);

    drawBackground();

    for (const pipe of world.pipes) {
        drawPipe(pipe);
    }

    drawBirds();
    drawHUD();
}

function updateDisplay() {
    const alive = E.getAliveCount(world);
    const leader = getCurrentLeader();

    document.getElementById("generation").textContent =
        generation;

    document.getElementById("alive").textContent =
        alive;

    document.getElementById("best").textContent =
        bestScore;

    document.getElementById("leader").textContent =
        leader ? leader.score : 0;

    document.getElementById("frames").textContent =
        totalFrames.toLocaleString();

    document.getElementById("seed").textContent =
        world.seed;

    document.getElementById("mode").textContent =
        turbo ? "Turbo Mode: 500 frames/batch" :
                "Watch Mode: 1 frame/batch";

    document.getElementById("spectator").textContent =
        alive + " birds alive in generation " + generation;

    document.getElementById("status").textContent =
        running ? "Training with shared engine V4" :
                  "Paused / Ready";

    document.getElementById("bar").style.width =
        Math.min(
            100,
            world.frame / MAX_FRAMES * 100
        ) + "%";

    document.getElementById("watch").classList.toggle(
        "active",
        !turbo
    );

    document.getElementById("turbo").classList.toggle(
        "active",
        turbo
    );
}

function log(message) {
    const element = document.getElementById("log");

    element.textContent += message + "\n";

    const lines = element.textContent.split("\n");

    if (lines.length > 150) {
        element.textContent = lines.slice(-150).join("\n");
    }

    element.scrollTop = element.scrollHeight;
}

function trainingLoop() {
    if (!running) {
        return;
    }

    const batch = turbo ? TURBO_BATCH : WATCH_BATCH;

    for (let i = 0; i < batch; i++) {
        simulateFrame();
    }

    renderGame();
    updateDisplay();

    animationId = requestAnimationFrame(trainingLoop);
}

function startTraining() {
    if (running) {
        return;
    }

    running = true;

    log("Shared-engine training started.");

    animationId = requestAnimationFrame(trainingLoop);
}

function pauseTraining() {
    running = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    updateDisplay();
    log("Training paused.");
}

function setWatchMode() {
    turbo = false;
    updateDisplay();
}

function setTurboMode() {
    turbo = true;
    updateDisplay();
}

function exportBrain() {
    if (!bestBrain) {
        log("No V4 champion available yet.");
        return;
    }

    const data = JSON.stringify(getModel(), null, 2);

    const blob = new Blob([data], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "flappy-v4-brain.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);

    log("V4 champion exported.");
}

function resetTraining() {
    pauseTraining();

    generation = 1;
    totalFrames = 0;

    bestBrain = null;
    bestScore = 0;
    bestFitness = -Infinity;
    bestGeneration = 0;
    trainingHistory = [];

    localStorage.removeItem(SAVE_KEY);

    brains = createPopulation();
    createTrainingWorld();

    document.getElementById("log").textContent = "";

    log("100 new birds initialized.");

    renderGame();
    updateDisplay();
}

function initialize() {
    initializeBrains();
    createTrainingWorld();

    document.getElementById("start").onclick =
        startTraining;

    document.getElementById("pause").onclick =
        pauseTraining;

    document.getElementById("watch").onclick =
        setWatchMode;

    document.getElementById("turbo").onclick =
        setTurboMode;

    document.getElementById("export").onclick =
        exportBrain;

    document.getElementById("reset").onclick =
        resetTraining;

    renderGame();
    updateDisplay();

    log("Shared engine: " + world.version);
    log("Population: " + POPULATION);
    log("Training physics: FlappyEngine.step()");
    log("Seed changes every 5 generations.");
    log("Ready for genuine V4 training.");
}

initialize();
