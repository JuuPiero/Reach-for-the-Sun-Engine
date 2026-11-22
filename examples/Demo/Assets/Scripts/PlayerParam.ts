import { field, UserData } from '@rs/core';

/** Tuning of the player (Assets/UserData/PlayerParam.user.json). */
export class PlayerParam extends UserData {
  @field({ min: 0, step: 0.5 }) moveSpeed = 5;
  @field({ min: 0, step: 10 }) turnSpeed = 540;
  @field({ min: 0 }) jumpHeight = 1.5;
}
