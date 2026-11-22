/**
 * UserData — a data asset (`.user.json`) holding the fields of a UserData class (RE's user files: tuning tables, character
 * parameters). Project scripts export `class PlayerParam extends UserData { @field() speed = 5 }`; the file is
 * `{ "format": 1, "type": "PlayerParam", "fields": { "speed": 7 } }`; components reference it with `@field({ type: 'userdata' })`.
 * One instance per file is shared by everything referencing it.
 */
export abstract class UserData {
  /** Project path of the file (`Assets/UserData/Player.user.json`). */
  path: string | null = null;
}
