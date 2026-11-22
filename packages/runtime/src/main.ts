// Entry of a packaged game: registers the project's scripts, then plays the start scene on <canvas id="rs-canvas">.
//   ?scene=Assets/Scenes/Other.scn.json   start on another scene
import 'virtual:rs/scripts';
import { project } from 'virtual:rs/project';
import { Application, Assets, Physics } from '@rs/core';
import { Player } from './Player';

Assets.baseUrl = './';
const canvas = document.getElementById('rs-canvas') as HTMLCanvasElement;
const player = new Player(canvas, project.name);
const scene = new URLSearchParams(location.search).get('scene') ?? project.startScene;
player.start(scene).then(
  () => document.getElementById('rs-loading')?.remove(),
  (e) => {
    const el = document.getElementById('rs-loading');
    if (el) el.textContent = `Failed to start: ${(e as Error).message}`;
    console.error(e);
  },
);
(window as unknown as { __rs: unknown }).__rs = { player, core: { Physics, Application } };
