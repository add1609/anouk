function GameManager(size, targetTile, tilesToAdd, InputManager, Actuator, ScoreManager) {
    this.size = size; // Size of the grid
    this.inputManager = new InputManager;
    this.scoreManager = new ScoreManager;
    this.actuator = new Actuator;

    this.startTiles = tilesToAdd;
    this.targetTile = targetTile;
    this.tilesToAdd = tilesToAdd;

    this.inputManager.on("move", this.move.bind(this));
    this.inputManager.on("restart", this.restart.bind(this));
    this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

    this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
    this.actuator.continue();
    this.setup();
};

// Keep playing after winning
GameManager.prototype.keepPlaying = function () {
    this.keepPlaying = true;
    this.actuator.continue();
};

GameManager.prototype.isGameTerminated = function () {
    return !!(this.over || (this.won && !this.keepPlaying));
};

// Set up the game
GameManager.prototype.setup = function () {
    this.grid = new Grid(this.size);

    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();

    // Update the actuator
    this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
    for (let i = 0; i < this.startTiles; i++) {
        this.addRandomTile();
    }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
    if (this.grid.cellsAvailable()) {
        const value = Math.random() < 0.9 ? 2 : 4;
        const tile = new Tile(this.grid.randomAvailableCell(), value);

        this.grid.insertTile(tile);
        return true;
    } else {
        return false;
    }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
    if (this.scoreManager.get() < this.score) {
        this.scoreManager.set(this.score);
    }

    this.actuator.actuate(this.grid, {
        score: this.score,
        over: this.over,
        won: this.won,
        bestScore: this.scoreManager.get(),
        terminated: this.isGameTerminated()
    });

};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
    this.grid.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.savePosition();
        }
    });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
    // 0: up, 1: right, 2:down, 3: left
    let self = this;

    if (this.isGameTerminated()) return; // Don't do anything if the game's over

    let cell, tile;

    const vector = this.getVector(direction);
    const traversals = this.buildTraversals(vector);
    let moved = false;

    // Save the current tile positions and remove merger information
    this.prepareTiles();

    // Traverse the grid in the right direction and move tiles
    traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) {
            cell = {x: x, y: y};
            tile = self.grid.cellContent(cell);

            if (tile) {
                const positions = self.findFarthestPosition(cell, vector);
                const next = self.grid.cellContent(positions.next);

                if (next && next.value === tile.value && !next.mergedFrom) {
                    const merged = new Tile(positions.next, tile.value * 2);
                    merged.mergedFrom = [tile, next];

                    self.grid.insertTile(merged);
                    self.grid.removeTile(tile);

                    // Converge the two tiles' positions
                    tile.updatePosition(positions.next);

                    // Update the score
                    self.score += merged.value;

                    // The mighty targetTile tile
                    if (merged.value === self.targetTile) self.won = true;
                } else {
                    self.moveTile(tile, positions.farthest);
                }

                if (!self.positionsEqual(cell, tile)) {
                    moved = true; // The tile moved from its original cell!
                }
            }
        });
    });

    if (moved) {
        for (let i = 0; i < this.tilesToAdd; ++i) {
            if (!this.addRandomTile()) {
                break;
            }
        }


        if (!this.movesAvailable()) {
            this.over = true; // Game over!
        }

        this.actuate();
    }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
    // Vectors representing tile movement
    const map = {
        0: {x: 0, y: -1}, // up
        1: {x: 1, y: 0},  // right
        2: {x: 0, y: 1},  // down
        3: {x: -1, y: 0}   // left
    };

    return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
    const traversals = {x: [], y: []};

    for (let pos = 0; pos < this.size; pos++) {
        traversals.x.push(pos);
        traversals.y.push(pos);
    }

    // Always traverse from the farthest cell in the chosen direction
    if (vector.x === 1) traversals.x = traversals.x.reverse();
    if (vector.y === 1) traversals.y = traversals.y.reverse();

    return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
    let previous;

    // Progress towards the vector direction until an obstacle is found
    do {
        previous = cell;
        cell = {x: previous.x + vector.x, y: previous.y + vector.y};
    } while (this.grid.withinBounds(cell) &&
    this.grid.cellAvailable(cell));

    return {
        farthest: previous,
        next: cell // Used to check if a merge is required
    };
};

GameManager.prototype.movesAvailable = function () {
    return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
    const self = this;
    let tile;
    for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
            tile = this.grid.cellContent({x: x, y: y});
            if (tile) {
                for (let direction = 0; direction < 4; direction++) {
                    const vector = self.getVector(direction);
                    const cell = {x: x + vector.x, y: y + vector.y};
                    const other = self.grid.cellContent(cell);
                    if (other && other.value === tile.value) {
                        return true; // These two tiles can be merged
                    }
                }
            }
        }
    }
    return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
    return first.x === second.x && first.y === second.y;
};
