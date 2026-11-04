
(function (root) {
    "use strict";

    const DEFAULTS = Object.freeze({
        width: 420,
        height: 420,
        gravity: 0.25,
        jumpForce: -4.6,
        birdX: 60,
        birdWidth: 34,
        birdHeight: 24,
        initialBirdY: 180,
        pipeWidth: 52,
        pipeGap: 90,
        pipePadding: 80,
        pipeSpawnX: 360,
        pipeSpeed: 1000 / 450,
        pipeInterval: 84,
        firstPipeFrame: 1,
        jumpCooldown: 9,
        seed: 12345
    });

    const MODEL_INPUTS = 5;
    const MODEL_HIDDEN = 8;
    const MODEL_WEIGHTS = 57;

    function normalizeSeed(value) {
        return Number(value) >>> 0;
    }

    function createRandom(seed) {
        let state = normalizeSeed(seed);

        function next() {
            state = (
                Math.imul(state, 1664525) +
                1013904223
            ) >>> 0;

            return state / 4294967296;
        }

        function getState() {
            return state;
        }

        return {
            next,
            getState
        };
    }

    function createConfig(options = {}) {
        const config = {
            ...DEFAULTS,
            ...options
        };

        const numbers = [
            "width",
            "height",
            "gravity",
            "jumpForce",
            "birdX",
            "birdWidth",
            "birdHeight",
            "initialBirdY",
            "pipeWidth",
            "pipeGap",
            "pipePadding",
            "pipeSpawnX",
            "pipeSpeed",
            "pipeInterval",
            "firstPipeFrame",
            "jumpCooldown"
        ];

        for (const key of numbers) {
            if (!Number.isFinite(config[key])) {
                throw new Error("Invalid config value: " + key);
            }
        }

        if (
            config.width <= 0 ||
            config.height <= 0 ||
            config.birdWidth <= 0 ||
            config.birdHeight <= 0 ||
            config.pipeWidth <= 0 ||
            config.pipeGap <= 0 ||
            config.pipeSpeed <= 0 ||
            config.pipeInterval < 1 ||
            config.firstPipeFrame < 1 ||
            config.jumpCooldown < 0 ||
            config.pipePadding < 0
        ) {
            throw new Error("Invalid world dimensions or timing");
        }

        if (
            config.pipeGap +
            config.pipePadding * 2 >= config.height
        ) {
            throw new Error("Not enough room for pipes");
        }

        config.seed = normalizeSeed(config.seed);

        return config;
    }

    function createWorld(options = {}) {
        const config = createConfig(options);

        return {
            version: 4,
            config,
            frame: 0,
            seed: config.seed,
            random: createRandom(config.seed),
            birds: [],
            pipes: [],
            nextBirdId: 1,
            nextPipeId: 1,
            totalPipes: 0
        };
    }

    function createBird(id, config) {
        return {
            id,
            x: config.birdX,
            y: config.initialBirdY,
            velocity: 0,
            rotation: 0,
            alive: true,
            score: 0,
            frames: 0,
            jumps: 0,
            cooldown: 0,
            lastPassedPipeId: 0,
            deathReason: null
        };
    }

    function addBird(world, id = null) {
        const birdId = id === null
            ? "bird-" + world.nextBirdId
            : String(id);

        if (world.birds.some(bird => bird.id === birdId)) {
            throw new Error("Duplicate bird ID");
        }

        const bird = createBird(birdId, world.config);

        world.birds.push(bird);
        world.nextBirdId++;

        return bird;
    }

    function addBirds(world, count, prefix = "ai") {
        const added = [];

        for (let i = 0; i < count; i++) {
            added.push(addBird(world, prefix + "-" + i));
        }

        return added;
    }

    function getBird(world, id) {
        return world.birds.find(bird => {
            return bird.id === String(id);
        }) || null;
    }

    function jump(world, id) {
        const bird = getBird(world, id);

        if (!bird || !bird.alive) {
            return false;
        }

        if (bird.cooldown > 0) {
            return false;
        }

        bird.velocity = world.config.jumpForce;
        bird.cooldown = world.config.jumpCooldown;
        bird.jumps++;

        return true;
    }

    function seededPipeHeight(world) {
        const config = world.config;

        const available =
            config.height -
            config.pipeGap -
            config.pipePadding * 2;

        return Math.floor(
            world.random.next() * available
        ) + config.pipePadding;
    }

    function spawnPipe(world) {
        const config = world.config;
        const top = seededPipeHeight(world);

        const pipe = {
            id: world.nextPipeId++,
            x: config.pipeSpawnX,
            width: config.pipeWidth,
            top,
            bottom: top + config.pipeGap
        };

        world.pipes.push(pipe);
        world.totalPipes++;

        return pipe;
    }

    function movePipes(world) {
        const speed = world.config.pipeSpeed;

        for (const pipe of world.pipes) {
            pipe.x -= speed;
        }

        world.pipes = world.pipes.filter(pipe => {
            return pipe.x + pipe.width >= -60;
        });
    }

    function getNextPipe(world, bird) {
        for (const pipe of world.pipes) {
            if (pipe.x + pipe.width >= bird.x) {
                return pipe;
            }
        }

        return null;
    }

    function updateBirdPhysics(world, bird) {
        if (!bird.alive) {
            return;
        }

        bird.frames++;

        if (bird.cooldown > 0) {
            bird.cooldown--;
        }

        bird.velocity += world.config.gravity;
        bird.y += bird.velocity;

        bird.rotation = Math.min(
            bird.velocity / 10 * 90,
            90
        );

        if (bird.y < 0) {
            bird.y = 0;

            if (bird.velocity < 0) {
                bird.velocity = 0;
            }
        }
    }

    function getBirdBounds(world, bird) {
        return {
            left: bird.x,
            right: bird.x + world.config.birdWidth,
            top: bird.y,
            bottom: bird.y + world.config.birdHeight
        };
    }

    function overlapsPipe(bounds, pipe) {
        return (
            bounds.right > pipe.x &&
            bounds.left < pipe.x + pipe.width
        );
    }

    function collidesWithPipe(world, bird, pipe) {
        const bounds = getBirdBounds(world, bird);

        if (!overlapsPipe(bounds, pipe)) {
            return false;
        }

        return (
            bounds.top < pipe.top ||
            bounds.bottom > pipe.bottom
        );
    }

    function killBird(bird, reason) {
        if (!bird.alive) {
            return;
        }

        bird.alive = false;
        bird.deathReason = reason;
    }

    function checkCollisions(world, bird) {
        if (!bird.alive) {
            return;
        }

        const bounds = getBirdBounds(world, bird);

        if (bounds.bottom >= world.config.height) {
            killBird(bird, "ground");
            return;
        }

        for (const pipe of world.pipes) {
            if (collidesWithPipe(world, bird, pipe)) {
                killBird(bird, "pipe");
                return;
            }
        }
    }

    function updateScore(world, bird) {
        if (!bird.alive) {
            return;
        }

        for (const pipe of world.pipes) {
            if (pipe.id <= bird.lastPassedPipeId) {
                continue;
            }

            if (pipe.x + pipe.width <= bird.x) {
                bird.score++;
                bird.lastPassedPipeId = pipe.id;
            }
        }
    }

    function updateWorld(world) {
        world.frame++;

        const config = world.config;
        const elapsed = world.frame - config.firstPipeFrame;

        if (
            elapsed >= 0 &&
            elapsed % config.pipeInterval === 0
        ) {
            spawnPipe(world);
        }

        movePipes(world);

        for (const bird of world.birds) {
            if (!bird.alive) {
                continue;
            }

            updateBirdPhysics(world, bird);
            checkCollisions(world, bird);
            updateScore(world, bird);
        }

        return getWorldStats(world);
    }

    function step(world, actions = {}) {
        for (const bird of world.birds) {
            if (!bird.alive) {
                continue;
            }

            if (actions[bird.id] === true) {
                jump(world, bird.id);
            }
        }

        return updateWorld(world);
    }

    function getAliveCount(world) {
        let alive = 0;

        for (const bird of world.birds) {
            if (bird.alive) {
                alive++;
            }
        }

        return alive;
    }

    function getBestBird(world) {
        let best = null;

        for (const bird of world.birds) {
            if (
                best === null ||
                bird.score > best.score ||
                (
                    bird.score === best.score &&
                    bird.frames > best.frames
                )
            ) {
                best = bird;
            }
        }

        return best;
    }

    function getObservation(world, bird) {
        const pipe = getNextPipe(world, bird);
        const config = world.config;

        if (!pipe) {
            return [
                0,
                1,
                bird.velocity / 6,
                bird.y / config.height,
                config.pipeGap / 200
            ];
        }

        const gapCenter = (
            pipe.top + pipe.bottom
        ) / 2;

        return [
            (
                gapCenter -
                bird.y -
                config.birdHeight / 2
            ) / 200,
            (pipe.x - bird.x) / 300,
            bird.velocity / 6,
            bird.y / config.height,
            config.pipeGap / 200
        ];
    }

    function predict(weights, inputs) {
        if (
            !Array.isArray(weights) ||
            weights.length !== MODEL_WEIGHTS
        ) {
            throw new Error("Invalid neural network weights");
        }

        if (
            !Array.isArray(inputs) ||
            inputs.length !== MODEL_INPUTS
        ) {
            throw new Error("Invalid neural network inputs");
        }

        const hidden = [];
        let index = 0;

        for (let i = 0; i < MODEL_HIDDEN; i++) {
            let sum = 0;

            for (let j = 0; j < MODEL_INPUTS; j++) {
                sum += inputs[j] * weights[index++];
            }

            sum += weights[index++];
            hidden.push(Math.tanh(sum));
        }

        let output = 0;

        for (let i = 0; i < MODEL_HIDDEN; i++) {
            output += hidden[i] * weights[index++];
        }

        output += weights[index];

        return Math.tanh(output);
    }

    function validateModel(model) {
        return Boolean(
            model &&
            model.type === "flappy-neuroevolution" &&
            model.inputs === MODEL_INPUTS &&
            model.hidden === MODEL_HIDDEN &&
            Array.isArray(model.weights) &&
            model.weights.length === MODEL_WEIGHTS &&
            model.weights.every(Number.isFinite)
        );
    }

    function modelAction(world, bird, model) {
        if (!bird.alive) {
            return false;
        }

        if (!validateModel(model)) {
            return false;
        }

        const pipe = getNextPipe(world, bird);

        if (!pipe || bird.cooldown > 0) {
            return false;
        }

        const inputs = getObservation(world, bird);
        const output = predict(model.weights, inputs);

        return output > 0.35;
    }

    function runFrames(world, count, controller = null) {
        const limit = Math.max(
            0,
            Math.floor(Number(count) || 0)
        );

        for (let i = 0; i < limit; i++) {
            if (getAliveCount(world) === 0) {
                break;
            }

            const actions = controller
                ? controller(world)
                : {};

            step(world, actions);
        }

        return getWorldStats(world);
    }

    function getWorldStats(world) {
        const best = getBestBird(world);

        return {
            version: world.version,
            frame: world.frame,
            seed: world.seed,
            alive: getAliveCount(world),
            population: world.birds.length,
            activePipes: world.pipes.length,
            totalPipes: world.totalPipes,
            bestScore: best ? best.score : 0,
            bestBirdId: best ? best.id : null
        };
    }

    function getSnapshot(world) {
        return {
            frame: world.frame,
            seed: world.seed,
            birds: world.birds.map(bird => ({
                id: bird.id,
                x: bird.x,
                y: bird.y,
                velocity: bird.velocity,
                rotation: bird.rotation,
                alive: bird.alive,
                score: bird.score,
                frames: bird.frames,
                jumps: bird.jumps,
                deathReason: bird.deathReason
            })),
            pipes: world.pipes.map(pipe => ({
                id: pipe.id,
                x: pipe.x,
                top: pipe.top,
                bottom: pipe.bottom,
                width: pipe.width
            }))
        };
    }

    function resetWorld(world, newSeed = world.seed) {
        const ids = world.birds.map(bird => bird.id);

        const fresh = createWorld({
            ...world.config,
            seed: newSeed
        });

        for (const id of ids) {
            addBird(fresh, id);
        }

        world.config = fresh.config;
        world.frame = fresh.frame;
        world.seed = fresh.seed;
        world.random = fresh.random;
        world.birds = fresh.birds;
        world.pipes = fresh.pipes;
        world.nextBirdId = fresh.nextBirdId;
        world.nextPipeId = fresh.nextPipeId;
        world.totalPipes = fresh.totalPipes;

        return world;
    }

    const FlappyEngine = Object.freeze({
        DEFAULTS,
        createConfig,
        createWorld,
        createRandom,
        addBird,
        addBirds,
        getBird,
        jump,
        spawnPipe,
        movePipes,
        getNextPipe,
        getBirdBounds,
        collidesWithPipe,
        step,
        runFrames,
        getObservation,
        predict,
        validateModel,
        modelAction,
        getAliveCount,
        getBestBird,
        getWorldStats,
        getSnapshot,
        resetWorld
    });

    root.FlappyEngine = FlappyEngine;

    if (
        typeof module !== "undefined" &&
        module.exports
    ) {
        module.exports = FlappyEngine;
    }
})(
    typeof globalThis !== "undefined"
        ? globalThis
        : this
);
