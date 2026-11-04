
/*
 * FLOPPY BIRD — CHAMPION BRAIN PACK
 * Generation 45 | Training score: 1189
 * Offline neural inference — no FlappyEngine dependency
 */

(function (root) {
  "use strict";

  const model = Object.freeze({
    type: "flappy-neuroevolution",
    version: 3,
    inputs: 5,
    hidden: 8,
    generation: 45,
    trainingScore: 1189,

    weights: Object.freeze([
      1.3272709538382612, 1.1653730163816691,
      0.041741171583266734, -0.2053647756395121,
      -0.2788441167519156, -0.284126359225558,
      1.6274954364583762, -1.3394953448798605,
      0.9865642551377334, -1.4085235022745888,
      0.6015925977430483, 0.20352396566870415,
      -3.4767395986581304, -0.22920317227841372,
      0.7328678376714394, -1.4825244164078168,
      -0.554631005899812, 0.010064862454933349,
      -2.6950388730383126, 0.09128746032640717,
      -0.559097042944783, -1.3949462555670102,
      0.26766041928123635, -0.11637556858113157,
      1.1423048458321716, -1.727221736307583,
      0.14250438160002143, -0.6179423289265068,
      0.5120420881187415, -0.04205459551413611,
      -3.754506806902994, -2.0057549976623736,
      0.04702918183592697, -1.0378218990725976,
      0.9974763688083903, -0.09918070441325871,
      -2.860211075651652, -0.020551438407791944,
      0.21352359409407495, 1.1109913191323164,
      -3.7904119160130363, 0.6534895455443115,
      -1.2491496255632226, 0.08588449111024177,
      -0.7333686886247179, -0.1852695065146061,
      -1.0480803611562057, 1.1702416150293649,
      -0.6836348684468427, -1.6218040619572127,
      1.6238856399508725, 0.43009267732540407,
      0.5302053774656698, 1.1841886120777476,
      3.3294487101144203, -0.6398705035030607,
      0.6728764210908889
    ])
  });

  function predict(inputs) {
    if (
      !Array.isArray(inputs) ||
      inputs.length !== 5 ||
      inputs.some(n => !Number.isFinite(n))
    ) {
      throw new Error("Brain requires five numeric inputs");
    }

    const w = model.weights;
    const hidden = [];
    let k = 0;

    // 8 hidden neurons, each with 5 inputs + bias
    for (let i = 0; i < 8; i++) {
      let sum = 0;

      for (let j = 0; j < 5; j++) {
        sum += inputs[j] * w[k++];
      }

      sum += w[k++];
      hidden.push(Math.tanh(sum));
    }

    // Output neuron
    let output = 0;

    for (let i = 0; i < 8; i++) {
      output += hidden[i] * w[k++];
    }

    output += w[k];

    return Math.tanh(output);
  }

  function shouldFlap(state) {
    // Same observation order as the training engine.
    const inputs = [
      (
        state.pipeTop +
        state.gap / 2 -
        state.birdY -
        12
      ) / 200,

      (state.pipeX - state.birdX) / 300,

      state.velocity / 6,

      state.birdY / state.height,

      state.gap / 200
    ];

    return predict(inputs) > 0.35;
  }

  root.FlappyChampion = Object.freeze({
    model,
    predict,
    shouldFlap
  });

  console.info(
    "CHAMPION BRAIN READY",
    "Generation:", model.generation,
    "Training score:", model.trainingScore
  );

})(window);
