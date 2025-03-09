// Get DOM elements
const canvas = document.getElementById('terrain-canvas');
const ctx = canvas.getContext('2d');
const gridSizeInput = document.getElementById('grid-size');
const noiseScaleInput = document.getElementById('noise-scale');
const waterLevelInput = document.getElementById('water-level');
const generateBtn = document.getElementById('generate-btn');
const saveBtn = document.getElementById('save-btn');
const placementOptions = document.querySelectorAll('.tool-option');
const sizeBtns = document.querySelectorAll('.size-btn');
const selectionSizeDisplay = document.getElementById('selection-size-display');
const coordDisplay = document.getElementById('coord-display');
const gridSizeValue = document.getElementById('grid-size-value');
const noiseScaleValue = document.getElementById('noise-scale-value');
const waterLevelValue = document.getElementById('water-level-value');

// Canvas setup
canvas.width = 800;
canvas.height = 600;

// Terrain parameters
let gridSize = 40; // Size of each tile in pixels
let gridWidth = 25; // Number of tiles across
let gridHeight = 25; // Number of tiles down
let noiseScale = 20; // Controls how zoomed-in the noise is
let waterLevel = 0.3; // Values below this are water
let selectionSize = 1; // Size of placement tool

// Camera position
let cameraX = 0;
let cameraY = 0;

// Mouse tracking for camera panning
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Selected tool/terrain type
let selectedTool = 'ground';

// The terrain grid data
let terrainGrid = [];
let structureGroups = [];
// Height map to track cube stacks
let heightMap = {}; // Maps "x,y" to stack heights
let hoverTile = null; // Store the current tile being hovered over

// Initialize height map along with terrain
function initTerrain() {
    terrainGrid = [];
    heightMap = {}; // Reset height map
    for (let y = 0; y < gridHeight; y++) {
        let row = [];
        for (let x = 0; x < gridWidth; x++) {
            row.push({
                type: 'ground',
                height: 0,
                structure: null,
                stackHeight: 0, // Track stack height for this position
                stackType: null  // Type of structure in the stack
            });
        }
        terrainGrid.push(row);
    }
}

//new structure stacking system
function updateStructureStacks() {
    // Clear old structure groups
    structureGroups = [];

    // Process each cell in the grid
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const tile = terrainGrid[y][x];
            const key = `${x},${y}`;

            // Update heightMap from tile data if needed
            if (tile.structure === 'cube' || tile.structure === 'pyramid') {
                if (heightMap[key] === undefined) {
                    heightMap[key] = 0;
                }

                // Ensure tile has stack properties
                if (tile.stackHeight === undefined) {
                    tile.stackHeight = heightMap[key];
                }
                if (tile.stackType === undefined) {
                    tile.stackType = tile.structure;
                }

                // Create a structure group for each stack
                structureGroups.push({
                    type: tile.structure,
                    x: x,
                    y: y,
                    height: tile.stackHeight,
                    tiles: [{x, y}]
                });
            }
        }
    }
}

// Generate terrain using simplex noise
function generateTerrain() {
    // Instantiate noise generator
    const noise = new SimplexNoise();

    // Generate heightmap based on noise
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            // Generate noise value between -1 and 1
            const noiseValue = noise.noise2D(x / noiseScale, y / noiseScale);

            // Determine terrain type based on noise value
            if (noiseValue < waterLevel) {
                terrainGrid[y][x] = {
                    type: 'water',
                    height: -0.5, // Slightly below ground level
                    structure: null
                };
            } else if (noiseValue > 0.6) {
                terrainGrid[y][x] = {
                    type: 'mountain',
                    height: 1 + Math.floor((noiseValue - 0.6) * 5), // 1-3 height levels
                    structure: null
                };
            } else {
                terrainGrid[y][x] = {
                    type: 'ground',
                    height: 0,
                    structure: null
                };

                // Add some random trees to ground tiles
                if (noiseValue > 0.35 && noiseValue < 0.5 && Math.random() < 0.3) {
                    if (noiseValue > 0.45) {
                        terrainGrid[y][x].structure = 'conifer';
                    } else if (noiseValue > 0.4) {
                        terrainGrid[y][x].structure = 'forest';
                    } else {
                        terrainGrid[y][x].structure = 'palm';
                    }
                }

                // Add some random buildings/structures
                if (noiseValue > 0.5 && noiseValue < 0.6 && Math.random() < 0.1) {
                    if (Math.random() < 0.5) {
                        terrainGrid[y][x].structure = 'cube';
                    } else {
                        terrainGrid[y][x].structure = 'pyramid';
                    }
                }
            }
        }
    }

    // Group adjacent structures
    identifyStructureGroups();

    renderTerrain();
}

// Identify and group adjacent structures
function identifyStructureGroups() {
    // Clear old structure groups
    structureGroups = [];

    // Create a list of all stacks
    const stacks = {};

    // Find all cubes and pyramids
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const tile = terrainGrid[y][x];
            if (tile.structure === 'cube' || tile.structure === 'pyramid') {
                const key = `${x},${y}`;

                // If this position has a stack height, use it
                // Otherwise set to 0 (ground level)
                if (!tile.stackHeight) {
                    tile.stackHeight = 0;
                }

                // Add this stack to our collection
                if (!stacks[key]) {
                    stacks[key] = {
                        type: tile.structure,
                        x: x,
                        y: y,
                        height: tile.stackHeight,
                        tiles: [{x, y, height: tile.stackHeight}]
                    };
                }
            }
        }
    }

    // Convert stacks to structure groups format
    structureGroups = Object.values(stacks);
}

// Convert isometric coordinates to screen coordinates
function isoToScreen(x, y, z = 0) {
    return {
        x: (x - y) * (gridSize / 2) + canvas.width / 2 - cameraX,
        y: (x + y) * (gridSize / 4) - z * gridSize / 2 + canvas.height / 2 - cameraY
    };
}

// Convert screen coordinates to isometric coordinates (approximate)
function screenToIso(screenX, screenY) {
    // Adjust for camera position
    screenX += cameraX - canvas.width / 2;
    screenY += cameraY - canvas.height / 2;

    // Convert to isometric coordinates
    const x = Math.floor((screenX / (gridSize / 2) + screenY / (gridSize / 4)) / 2);
    const y = Math.floor((screenY / (gridSize / 4) - screenX / (gridSize / 2)) / 2);

    return {x, y};
}

// Render the terrain grid
function renderTerrain() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get all positions with height information
    const positions = [];

    // Add all tiles
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            positions.push({x, y, z: 0, type: 'tile'});
        }
    }

    // Add all structure positions
    for (const group of structureGroups) {
        positions.push({
            x: group.x,
            y: group.y,
            z: group.height + 1, // +1 so it renders above the tile
            type: 'structure',
            group: group
        });
    }

    // Sort first by distance from camera (back to front)
    // then by height (bottom to top)
    positions.sort((a, b) => {
        const distA = a.x + a.y;
        const distB = b.x + b.y;
        if (distA !== distB) return distA - distB;
        return a.z - b.z;
    });

    // Draw in sorted order
    for (const pos of positions) {
        if (pos.type === 'tile') {
            const tile = terrainGrid[pos.y][pos.x];
            drawTile(pos.x, pos.y, tile);

            // Draw individual structures after the tile
            if (tile.structure && tile.structure !== 'cube' && tile.structure !== 'pyramid') {
                drawStructure(pos.x, pos.y, tile);
            }
        } else if (pos.type === 'structure') {
            // Draw the appropriate large structure
            const screenPos = isoToScreen(pos.x, pos.y);
            if (pos.group.type === 'cube') {
                drawLargeCube(screenPos.x, screenPos.y, gridSize, pos.group);
            } else if (pos.group.type === 'pyramid') {
                drawLargePyramid(screenPos.x, screenPos.y, gridSize, pos.group);
            }
        }
    }
}

// Draw a single tile
function drawTile(x, y, tile) {
    // Calculate screen position of tile
    const screenPos = isoToScreen(x, y, tile.height);
    const tileX = screenPos.x;
    const tileY = screenPos.y;

    // Determine color based on tile type
    let color;
    switch (tile.type) {
        case 'water':
            color = '#3498db';
            break;
        case 'mountain':
            // Different shades for different heights
            const shade = 150 - tile.height * 15;
            color = `rgb(${shade}, ${shade}, ${shade})`;
            break;
        case 'ground':
        default:
            color = '#8BC34A';
            break;
    }

    // Draw tile as a diamond
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tileX, tileY - gridSize / 4); // Top point
    ctx.lineTo(tileX + gridSize / 2, tileY); // Right point
    ctx.lineTo(tileX, tileY + gridSize / 4); // Bottom point
    ctx.lineTo(tileX - gridSize / 2, tileY); // Left point
    ctx.closePath();
    ctx.fill();

    // Add shading to create depth
    if (tile.type === 'ground' || tile.type === 'mountain') {
        // Top edge highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(tileX, tileY - gridSize / 4);
        ctx.lineTo(tileX + gridSize / 2, tileY);
        ctx.lineTo(tileX, tileY);
        ctx.lineTo(tileX - gridSize / 4, tileY - gridSize / 8);
        ctx.closePath();
        ctx.fill();

        // Bottom edge shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.moveTo(tileX, tileY);
        ctx.lineTo(tileX + gridSize / 4, tileY + gridSize / 8);
        ctx.lineTo(tileX, tileY + gridSize / 4);
        ctx.lineTo(tileX - gridSize / 4, tileY + gridSize / 8);
        ctx.closePath();
        ctx.fill();
    }

    // Add water effects
    if (tile.type === 'water') {
        // Waves/reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(tileX - gridSize / 4, tileY - gridSize / 8);
        ctx.quadraticCurveTo(tileX, tileY - gridSize / 16, tileX + gridSize / 4, tileY - gridSize / 8);
        ctx.quadraticCurveTo(tileX, tileY, tileX - gridSize / 4, tileY - gridSize / 8);
        ctx.closePath();
        ctx.fill();
    }

    // Draw height levels for mountains
    if (tile.type === 'mountain' && tile.height > 0) {
        for (let i = 0; i < tile.height; i++) {
            const levelY = tileY + (i + 1) * gridSize / 4;
            const shade = 120 - i * 15;

            // Side faces
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;

            // Left face
            ctx.beginPath();
            ctx.moveTo(tileX - gridSize / 2, levelY - gridSize / 4);
            ctx.lineTo(tileX, levelY);
            ctx.lineTo(tileX, levelY + gridSize / 4);
            ctx.lineTo(tileX - gridSize / 2, levelY);
            ctx.closePath();
            ctx.fill();

            // Right face
            ctx.fillStyle = `rgb(${shade + 20}, ${shade + 20}, ${shade + 20})`;
            ctx.beginPath();
            ctx.moveTo(tileX + gridSize / 2, levelY - gridSize / 4);
            ctx.lineTo(tileX, levelY);
            ctx.lineTo(tileX, levelY + gridSize / 4);
            ctx.lineTo(tileX + gridSize / 2, levelY);
            ctx.closePath();
            ctx.fill();
        }
    }
}

// Draw a structure on a tile
function drawStructure(x, y, tile) {
    // Calculate screen position
    const screenPos = isoToScreen(x, y, tile.height);
    const structureX = screenPos.x;
    const structureY = screenPos.y;

    switch (tile.structure) {
        case 'forest':
            drawDeciduousTree(structureX, structureY, gridSize * 0.8);
            break;
        case 'conifer':
            drawConiferTree(structureX, structureY, gridSize * 0.8);
            break;
        case 'pine':
            drawPineTree(structureX, structureY, gridSize * 0.8);
            break;
        case 'palm':
            drawPalmTree(structureX, structureY, gridSize * 0.8);
            break;
    }
}

// Tree trunk drawing function
function drawTreeTrunk(x, y, trunkWidth, trunkHeight, type = 'normal') {
    let trunkDark = '#5D4037';  // Dark brown (shadow side)
    let trunkMid = '#8D6E63';   // Medium brown (lit side)
    let trunkLight = '#A1887F'; // Light brown (top)

    if (type === 'palm') {
        trunkDark = '#6D4C41';
        trunkMid = '#8D6E63';
        trunkLight = '#A1887F';
    }

    // Left face of trunk
    ctx.fillStyle = trunkDark;
    ctx.beginPath();
    ctx.moveTo(x - trunkWidth/2, y - trunkHeight/3);
    ctx.lineTo(x, y - trunkHeight/3 + trunkWidth/4);
    ctx.lineTo(x, y + trunkWidth/4);
    ctx.lineTo(x - trunkWidth/2, y);
    ctx.closePath();
    ctx.fill();

    // Right face of trunk
    ctx.fillStyle = trunkMid;
    ctx.beginPath();
    ctx.moveTo(x + trunkWidth/2, y - trunkHeight/3);
    ctx.lineTo(x, y - trunkHeight/3 + trunkWidth/4);
    ctx.lineTo(x, y + trunkWidth/4);
    ctx.lineTo(x + trunkWidth/2, y);
    ctx.closePath();
    ctx.fill();

    // Top face of trunk
    ctx.fillStyle = trunkLight;
    ctx.beginPath();
    ctx.moveTo(x - trunkWidth/2, y - trunkHeight/3);
    ctx.lineTo(x, y - trunkHeight/3 + trunkWidth/4);
    ctx.lineTo(x + trunkWidth/2, y - trunkHeight/3);
    ctx.lineTo(x, y - trunkHeight/3 - trunkWidth/4);
    ctx.closePath();
    ctx.fill();
}

// Draw a conifer tree (Christmas tree style)
function drawConiferTree(x, y, size) {
    const layers = 4; // Number of foliage layers
    const baseWidth = size * 0.8;
    const topOffset = size * 0.8;

    // Draw each layer from bottom to top
    for (let i = 0; i < layers; i++) {
        const layerSize = baseWidth * (1 - i / layers * 0.6);
        const layerY = y - topOffset * (i / layers) - size * 0.3;

        // Draw triangular layer
        ctx.fillStyle = i % 2 === 0 ? '#1B5E20' : '#2E7D32'; // Alternate slightly different greens

        // Draw isometric triangle
        ctx.beginPath();
        ctx.moveTo(x, layerY - layerSize * 0.4); // Top point
        ctx.lineTo(x + layerSize * 0.5, layerY); // Right point
        ctx.lineTo(x, layerY + layerSize * 0.2); // Bottom point
        ctx.lineTo(x - layerSize * 0.5, layerY); // Left point
        ctx.closePath();
        ctx.fill();
    }

    // Draw small top triangle
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.moveTo(x, y - topOffset - size * 0.5); // Top point
    ctx.lineTo(x + size * 0.15, y - topOffset - size * 0.3); // Right
    ctx.lineTo(x, y - topOffset - size * 0.2); // Bottom
    ctx.lineTo(x - size * 0.15, y - topOffset - size * 0.3); // Left
    ctx.closePath();
    ctx.fill();

    // Add snow highlights on top of each layer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < layers; i++) {
        const layerSize = baseWidth * (1 - i / layers * 0.6);
        const layerY = y - topOffset * (i / layers) - size * 0.3;

        ctx.beginPath();
        ctx.moveTo(x, layerY - layerSize * 0.4);
        ctx.lineTo(x + layerSize * 0.3, layerY - layerSize * 0.1);
        ctx.lineTo(x - layerSize * 0.3, layerY - layerSize * 0.1);
        ctx.closePath();
        ctx.fill();
    }
}

// Draw a pine tree (tall and narrow)
function drawPineTree(x, y, size) {
    const layers = 3;
    const height = size * 1.5;

    // Draw layers from bottom to top
    for (let i = 0; i < layers; i++) {
        const layerWidth = size * 0.6 * (1 - i * 0.2);
        const layerY = y - height * (i / layers) - size * 0.3;

        // Draw pine layer (more triangular than conifer)
        ctx.fillStyle = '#1B4E30'; // Darker green for pine

        // Draw triangular layer
        ctx.beginPath();
        ctx.moveTo(x, layerY - layerWidth * 0.7); // Pointier top
        ctx.lineTo(x + layerWidth * 0.4, layerY);
        ctx.lineTo(x, layerY + layerWidth * 0.2);
        ctx.lineTo(x - layerWidth * 0.4, layerY);
        ctx.closePath();
        ctx.fill();
    }

    // Add subtle highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(x - size/6, y - height * 0.7, size/8, 0, Math.PI * 2);
    ctx.fill();
}

// Draw a deciduous tree (round top)
function drawDeciduousTree(x, y, size) {
    // Main foliage - layered circles for more 3D effect
    // Bottom layer (darker)
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.6, size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Middle layer
    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.7, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Top layer (brightest)
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.8, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Highlight for depth
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(x - size/8, y - size * 0.9, size/6, 0, Math.PI * 2);
    ctx.fill();
}

// Draw a palm tree
function drawPalmTree(x, y, size) {
    // Palm fronds in a circular pattern
    const numFronds = 8;
    const frondLength = size * 0.8;

    for (let i = 0; i < numFronds; i++) {
        const angle = (i / numFronds) * Math.PI * 2;
        const frondX = x + Math.cos(angle) * frondLength * 0.5;
        const frondY = y - size + Math.sin(angle) * frondLength * 0.25;

        // Draw each frond as an elongated shape
        ctx.fillStyle = i % 2 === 0 ? '#4CAF50' : '#388E3C'; // Alternate greens

        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.9); // Base of frond
        ctx.quadraticCurveTo(
            x + Math.cos(angle) * frondLength * 0.8,
            y - size * 0.8 + Math.sin(angle) * frondLength * 0.4,
            frondX, frondY
        );
        ctx.lineTo(
            frondX + Math.cos(angle + 0.2) * frondLength * 0.2,
            frondY + Math.sin(angle + 0.2) * frondLength * 0.1
        );
        ctx.lineTo(
            frondX + Math.cos(angle - 0.2) * frondLength * 0.2,
            frondY + Math.sin(angle - 0.2) * frondLength * 0.1
        );
        ctx.closePath();
        ctx.fill();
    }

    // Add coconuts
    ctx.fillStyle = '#795548';
    for (let i = 0; i < 3; i++) {
        const coconutAngle = Math.random() * Math.PI * 2;
        const distance = size * 0.1 + Math.random() * size * 0.1;

        ctx.beginPath();
        ctx.arc(
            x + Math.cos(coconutAngle) * distance,
            y - size * 0.9 + Math.sin(coconutAngle) * distance,
            size * 0.1,
            0, Math.PI * 2
        );
        ctx.fill();
    }
}

// Draw a large cube that spans multiple tiles
function drawLargeCube(x, y, size, group) {
    // Get stack height from group
    const stackHeight = group.height || 0;

    // Calculate actual cube height (with cubeSize proportions)
    const cubeSize = size * 0.75;
    const cubeHeight = cubeSize * 0.75; // Height of a single cube

    // The offset needs to be the full stack height in the isometric system
    // Plus a small base offset to ensure it sits on the ground
    const baseOffset = 0.25 * size; // Small offset to ensure it sits on the ground
    const heightOffset = stackHeight * cubeHeight + baseOffset;

    // Apply the offset to y position
    const adjustedY = y - heightOffset;

    // Add some color variety based on height
    const baseColor = 230 - stackHeight * 10; // Darker as it goes higher
    const cubeFaceColor = `rgb(${baseColor}, ${Math.floor(baseColor * 0.75)}, 0)`;

    // Top face
    ctx.fillStyle = cubeFaceColor;
    ctx.beginPath();
    ctx.moveTo(x, adjustedY);
    ctx.lineTo(x + cubeSize / 2, adjustedY + cubeSize / 4);
    ctx.lineTo(x, adjustedY + cubeSize / 2);
    ctx.lineTo(x - cubeSize / 2, adjustedY + cubeSize / 4);
    ctx.closePath();
    ctx.fill();

    // Left face
    ctx.fillStyle = `rgba(${Math.floor(baseColor * 0.7)}, ${Math.floor(baseColor * 0.5)}, 0, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(x - cubeSize / 2, adjustedY + cubeSize / 4);
    ctx.lineTo(x, adjustedY + cubeSize / 2);
    ctx.lineTo(x, adjustedY + cubeSize);
    ctx.lineTo(x - cubeSize / 2, adjustedY + cubeSize - cubeSize / 4);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = `rgba(${Math.floor(baseColor * 0.8)}, ${Math.floor(baseColor * 0.6)}, 0, 0.9)`;
    ctx.beginPath();
    ctx.moveTo(x + cubeSize / 2, adjustedY + cubeSize / 4);
    ctx.lineTo(x, adjustedY + cubeSize / 2);
    ctx.lineTo(x, adjustedY + cubeSize);
    ctx.lineTo(x + cubeSize / 2, adjustedY + cubeSize - cubeSize / 4);
    ctx.closePath();
    ctx.fill();

    // Add details
    if (stackHeight === 0) {
        // Only add details to ground level cubes
        const detailSize = size / 10;

        // Window or detail on side
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(
            x - cubeSize / 4,
            adjustedY + cubeSize / 2,
            detailSize,
            detailSize * 1.5
        );
    }
}


// Add details to large cube
function addCubeDetails(x, y, size, tileCount) {
    // Add windows or patterns based on size
    const detailSize = size / 10;
    const detailPadding = size / 8;

    // Top face details
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(x, y + size / 8, detailSize, 0, Math.PI * 2);
    ctx.fill();

    // Add more details for larger structures
    if (tileCount >= 4) {
        // Add windows to left face
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

        const rows = Math.min(3, Math.ceil(tileCount / 2));
        const cols = Math.min(2, Math.floor(tileCount / 2));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Left face windows
                ctx.fillRect(
                    x - size / 3 + (c * detailSize * 2),
                    y + size / 2 + (r * detailSize * 2),
                    detailSize,
                    detailSize * 1.5
                );

                // Right face windows
                ctx.fillRect(
                    x + size / 6 - (c * detailSize * 2),
                    y + size / 2 + (r * detailSize * 2),
                    detailSize,
                    detailSize * 1.5
                );
            }
        }
    }
}

function addNewStructureTypes() {
    // Get the structures tool section
    const structuresSection = document.querySelector('.tool-section:nth-of-type(3) .tool-options');

    if (!structuresSection) {
        console.error("Could not find the structures tool section");
        return;
    }

    // Add new structure options
    const newStructures = [
        {type: 'dome', label: 'Dome', icon: 'dome-icon'},
        {type: 'cylinder', label: 'Cylinder', icon: 'cylinder-icon'},
        {type: 'arch', label: 'Arch', icon: 'arch-icon'}
    ];

    newStructures.forEach(structure => {
        // Create new option element
        const optionElement = document.createElement('div');
        optionElement.classList.add('tool-option');
        optionElement.setAttribute('data-type', structure.type);

        // Add icon
        const iconElement = document.createElement('div');
        iconElement.classList.add('tool-icon', structure.icon);

        // Add label
        const labelElement = document.createElement('div');
        labelElement.classList.add('tool-label');
        labelElement.textContent = structure.label;

        // Assemble element
        optionElement.appendChild(iconElement);
        optionElement.appendChild(labelElement);

        // Add click handler
        optionElement.addEventListener('click', function () {
            // Remove active class from all options
            document.querySelectorAll('.tool-option').forEach(opt => {
                opt.classList.remove('active');
            });

            // Add active class to this option
            this.classList.add('active');

            // Set selected tool
            selectedTool = this.getAttribute('data-type');
        });

        // Add to structures section
        structuresSection.appendChild(optionElement);
    });
}

// Draw a large pyramid that spans multiple tiles
function drawLargePyramid(x, y, size, group) {
    // Get stack height from group
    const stackHeight = group.height || 0;

    // Calculate vertical offset based on stack height
    const pyrSize = size * 0.75;
    const pyramidHeight = pyrSize * 0.8; // Height of a single pyramid

    // The offset needs to be the full stack height in the isometric system
    // Plus a small base offset to ensure it sits on the ground
    const baseOffset = 0.25 * size; // Small offset to ensure it sits on the ground
    const heightOffset = stackHeight * pyramidHeight + baseOffset;

    // Apply the offset to y position
    const adjustedY = y - heightOffset;

    // Add some color variety based on height
    const baseRed = 230 - stackHeight * 10; // Darker as it goes higher
    const baseColor = `rgb(${baseRed}, ${Math.floor(baseRed * 0.3)}, ${Math.floor(baseRed * 0.1)})`;

    // Base
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(x, adjustedY + pyrSize / 2);
    ctx.lineTo(x + pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.lineTo(x, adjustedY + pyrSize);
    ctx.lineTo(x - pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.closePath();
    ctx.fill();

    // Left face
    ctx.fillStyle = `rgba(${Math.floor(baseRed * 0.8)}, ${Math.floor(baseRed * 0.2)}, 0, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(x, adjustedY - pyramidHeight + pyrSize);
    ctx.lineTo(x - pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.lineTo(x, adjustedY + pyrSize);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = `rgba(${Math.floor(baseRed * 0.9)}, ${Math.floor(baseRed * 0.25)}, 10, 0.9)`;
    ctx.beginPath();
    ctx.moveTo(x, adjustedY - pyramidHeight + pyrSize);
    ctx.lineTo(x + pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.lineTo(x, adjustedY + pyrSize);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = `rgba(${Math.floor(baseRed * 0.85)}, ${Math.floor(baseRed * 0.3)}, 5, 0.85)`;
    ctx.beginPath();
    ctx.moveTo(x, adjustedY - pyramidHeight + pyrSize);
    ctx.lineTo(x - pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.lineTo(x + pyrSize / 2, adjustedY + pyrSize * 3/4);
    ctx.closePath();
    ctx.fill();
}


// Add right-click handler for removing top cube from stack
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Prevent default context menu

    // Only if not dragging
    if (!isDragging) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert to iso coordinates
        const isoCoords = screenToIso(mouseX, mouseY);

        // Try to remove a cube at this position
        removeCubeFromStack(isoCoords.x, isoCoords.y);
    }
});

// Draw stepped base for large pyramids
function drawSteppedPyramidBase(x, y, size) {
    const stepLevels = 3;

    // Draw steps on each side
    for (let step = 1; step <= stepLevels; step++) {
        const stepSize = size * (1 - step / (stepLevels + 2));
        const stepHeight = size / 10;
        const stepY = y + size / 2 - step * stepHeight;

        // Step platform
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.moveTo(x, stepY);
        ctx.lineTo(x + stepSize / 2, stepY + stepSize / 4);
        ctx.lineTo(x, stepY + stepSize / 2);
        ctx.lineTo(x - stepSize / 2, stepY + stepSize / 4);
        ctx.closePath();
        ctx.fill();

        // Step sides (optional - for more detail)
        ctx.fillStyle = 'rgba(200, 60, 0, 0.8)';
        ctx.beginPath();
        ctx.moveTo(x - stepSize / 2, stepY + stepSize / 4);
        ctx.lineTo(x, stepY + stepSize / 2);
        ctx.lineTo(x, stepY + stepSize / 2 + stepHeight);
        ctx.lineTo(x - stepSize / 2, stepY + stepSize / 4 + stepHeight);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(240, 80, 20, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x + stepSize / 2, stepY + stepSize / 4);
        ctx.lineTo(x, stepY + stepSize / 2);
        ctx.lineTo(x, stepY + stepSize / 2 + stepHeight);
        ctx.lineTo(x + stepSize / 2, stepY + stepSize / 4 + stepHeight);
        ctx.closePath();
        ctx.fill();
    }
}

// Add details to large pyramid
function addPyramidDetails(x, y, size, height) {
    // Add entrance/doorway at the bottom
    ctx.fillStyle = '#3E2723';
    const doorWidth = size / 6;
    const doorHeight = size / 4;

    // Door
    ctx.beginPath();
    ctx.moveTo(x, y + size / 2 - doorHeight);
    ctx.lineTo(x + doorWidth, y + size / 2 - doorHeight + doorWidth / 2);
    ctx.lineTo(x, y + size / 2);
    ctx.lineTo(x - doorWidth, y + size / 2 - doorHeight + doorWidth / 2);
    ctx.closePath();
    ctx.fill();

    // Add capstone at the top
    ctx.fillStyle = '#FFD54F';
    const capSize = size / 10;

    ctx.beginPath();
    ctx.moveTo(x, y - height + size - capSize * 2);
    ctx.lineTo(x + capSize, y - height + size - capSize);
    ctx.lineTo(x, y - height + size);
    ctx.lineTo(x - capSize, y - height + size - capSize);
    ctx.closePath();
    ctx.fill();
}

// Update and display tile coordinate under mouse
function updateCoordDisplay(x, y) {
    coordDisplay.textContent = `X: ${x}, Y: ${y}`;
}

// Handle user placing items on the grid
function placeTile(tileX, tileY) {
    // Check if coordinates are within bounds
    if (tileX < 0 || tileY < 0 || tileX >= gridWidth || tileY >= gridHeight) {
        return;
    }

    // For each tile in the selection area
    for (let y = 0; y < selectionSize; y++) {
        for (let x = 0; x < selectionSize; x++) {
            if (tileX + x < gridWidth && tileY + y < gridHeight) {
                const tile = terrainGrid[tileY + y][tileX + x];
                const key = `${tileX + x},${tileY + y}`;

                switch(selectedTool) {
                    case 'ground':
                        // Reset this position
                        tile.type = 'ground';
                        tile.height = 0;
                        tile.structure = null;
                        tile.stackHeight = 0;
                        tile.stackType = null;
                        delete heightMap[key];
                        break;

                    case 'water':
                        tile.type = 'water';
                        tile.height = -0.5;
                        tile.structure = null;
                        tile.stackHeight = 0;
                        tile.stackType = null;
                        delete heightMap[key];
                        break;

                    case 'mountain':
                        tile.type = 'mountain';
                        tile.height = 1 + Math.floor(Math.random() * 3);
                        tile.structure = null;
                        tile.stackHeight = 0;
                        tile.stackType = null;
                        delete heightMap[key];
                        break;

                    case 'forest':
                    case 'conifer':
                    case 'palm':
                        tile.type = 'ground';
                        tile.height = 0;
                        tile.structure = selectedTool;
                        tile.stackHeight = 0;
                        tile.stackType = null;
                        delete heightMap[key];
                        break;

                    case 'cube':
                    case 'pyramid':
                        // Handle stacking
                        if (tile.structure === 'cube' || tile.structure === 'pyramid') {
                            // Already has a structure - check if same type
                            if (tile.structure === selectedTool) {
                                // Stack on top - increase height
                                if (!heightMap[key] && heightMap[key] !== 0) {
                                    heightMap[key] = 0; // Initialize if undefined
                                }

                                // Increment stack height
                                heightMap[key] += 1;
                                tile.stackHeight = heightMap[key];

                                // Update the structure group for this position
                                updateStructureForPosition(tileX + x, tileY + y, selectedTool, heightMap[key]);
                            } else {
                                // Different type - replace with new type
                                tile.structure = selectedTool;
                                tile.stackType = selectedTool;
                                // Keep the same height
                                updateStructureForPosition(tileX + x, tileY + y, selectedTool, heightMap[key] || 0);
                            }
                        } else {
                            // New structure
                            tile.type = 'ground';
                            tile.height = 0;
                            tile.structure = selectedTool;
                            tile.stackType = selectedTool;
                            tile.stackHeight = 0;
                            heightMap[key] = 0;

                            // Update the structure group
                            updateStructureForPosition(tileX + x, tileY + y, selectedTool, 0);
                        }
                        break;
                }
            }
        }
    }

    // Update stacks and render
    updateStructureStacks();
    renderTerrain();
}

function updateStructureForPosition(x, y, type, height) {
    // Find if this position already has a structure group
    let foundGroup = false;

    for (let i = 0; i < structureGroups.length; i++) {
        const group = structureGroups[i];

        // Check if this group contains our position
        for (let j = 0; j < group.tiles.length; j++) {
            const tile = group.tiles[j];
            if (tile.x === x && tile.y === y) {
                // Update the existing group
                group.type = type;
                group.height = height;
                foundGroup = true;
                break;
            }
        }

        if (foundGroup) break;
    }

    // If no group was found, create a new one
    if (!foundGroup) {
        structureGroups.push({
            type: type,
            x: x,
            y: y,
            height: height,
            tiles: [{x, y}]
        });
    }
}

// Add a new function to handle removing cubes from the top of stacks
function removeCubeFromStack(tileX, tileY) {
    if (tileX < 0 || tileY < 0 || tileX >= gridWidth || tileY >= gridHeight) {
        return false;
    }

    const tile = terrainGrid[tileY][tileX];
    const key = `${tileX},${tileY}`;

    if (tile.structure === 'cube' || tile.structure === 'pyramid') {
        if (heightMap[key] > 0) {
            // Reduce stack height
            heightMap[key]--;
            tile.stackHeight = heightMap[key];
        } else {
            // Remove structure completely
            tile.structure = null;
            tile.stackType = null;
            tile.stackHeight = 0;
            delete heightMap[key];
        }

        updateStructureStacks();
        renderTerrain();
        return true;
    }

    return false;
}

// Update parameter displays
function updateDisplays() {
    gridSizeValue.textContent = `${gridSize}px`;
    noiseScaleValue.textContent = noiseScale.toFixed(0);
    waterLevelValue.textContent = `${(waterLevel * 100).toFixed(0)}%`;
    selectionSizeDisplay.textContent = `Selection: ${selectionSize}×${selectionSize}`;
}

// Save the generated image
function saveImage() {
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'isometric-terrain.png';
    link.click();
}

// Event listeners for UI controls
gridSizeInput.addEventListener('input', () => {
    gridSize = parseInt(gridSizeInput.value);
    updateDisplays();
    renderTerrain();
});

noiseScaleInput.addEventListener('input', () => {
    noiseScale = parseFloat(noiseScaleInput.value);
    updateDisplays();
});

waterLevelInput.addEventListener('input', () => {
    waterLevel = parseFloat(waterLevelInput.value) / 100;
    updateDisplays();
});

generateBtn.addEventListener('click', () => {
    console.log("Generate button clicked");
    generateTerrain();
});

saveBtn.addEventListener('click', saveImage);

// Tool selection
placementOptions.forEach(option => {
    option.addEventListener('click', () => {
        // Update active option
        placementOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');

        // Set selected tool
        selectedTool = option.getAttribute('data-type');
    });
});

// Selection size buttons
sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active button
        sizeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Set selection size
        selectionSize = parseInt(btn.id.split('-')[1]);
        updateDisplays();
    });
});

// Mouse handling for camera panning
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // Right mouse button
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to isometric grid
    const isoCoords = screenToIso(mouseX, mouseY);
    updateCoordDisplay(isoCoords.x, isoCoords.y);

    // Handle camera panning
    if (isDragging) {
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        cameraX -= deltaX;
        cameraY -= deltaY;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        renderTerrain();
    }
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'default';
    }
});

// Mouse click to place tiles
canvas.addEventListener('click', (e) => {
    if (e.button === 0) { // Left button
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert screen coordinates to isometric grid
        const isoCoords = screenToIso(mouseX, mouseY);
        placeTile(isoCoords.x, isoCoords.y);
    }
});

// Prevent context menu on right-click
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Keyboard controls for camera movement
window.addEventListener('keydown', (e) => {
    const moveAmount = 10;

    switch(e.key) {
        case 'ArrowUp':
        case 'w':
            cameraY -= moveAmount;
            break;
        case 'ArrowDown':
        case 's':
            cameraY += moveAmount;
            break;
        case 'ArrowLeft':
        case 'a':
            cameraX -= moveAmount;
            break;
        case 'ArrowRight':
        case 'd':
            cameraX += moveAmount;
            break;
        case 'r':
            // Reset camera
            cameraX = 0;
            cameraY = 0;
            break;
    }

    renderTerrain();
});

// Initialize and start - with delay to ensure canvas is properly sized
setTimeout(() => {
    console.log("Initializing terrain...");
    initTerrain();
    generateTerrain();
    identifyStructureGroups(); // Make sure structure groups are initialized
    updateDisplays();
    renderTerrain(); // Ensure the terrain is rendered with all structures
}, 200);

// Add this code to the end of your scripts.js file

// When the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const toolOptions = document.querySelectorAll('.tool-option');
    const sizeButtons = document.querySelectorAll('.size-btn');

    // Function to add a ripple effect on click
    function createRipple(event) {
        const button = event.currentTarget;

        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - button.getBoundingClientRect().left - diameter / 2}px`;
        circle.style.top = `${event.clientY - button.getBoundingClientRect().top - diameter / 2}px`;
        circle.classList.add('ripple');

        // Remove existing ripples
        const ripple = button.querySelector('.ripple');
        if (ripple) {
            ripple.remove();
        }

        button.appendChild(circle);
    }

    // Add ripple effect to all tool options
    toolOptions.forEach(button => {
        button.addEventListener('click', createRipple);
    });

    // Add ripple effect to all size buttons
    sizeButtons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
});
// Enhanced animations for tool options
// Add this to your scripts.js file

document.addEventListener('DOMContentLoaded', function() {
    const toolOptions = document.querySelectorAll('.tool-option');
    const sizeButtons = document.querySelectorAll('.size-btn');

    // Function to add a ripple effect on click
    function createRipple(event) {
        const button = event.currentTarget;

        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - button.getBoundingClientRect().left - diameter / 2}px`;
        circle.style.top = `${event.clientY - button.getBoundingClientRect().top - diameter / 2}px`;
        circle.classList.add('ripple');

        // Remove existing ripples
        const ripple = button.querySelector('.ripple');
        if (ripple) {
            ripple.remove();
        }

        button.appendChild(circle);
    }

    // Add ripple effect to all tool options
    toolOptions.forEach(button => {
        button.addEventListener('click', createRipple);

        // Handle click to set active state
        button.addEventListener('click', function() {
            // Find all options in the same section
            const section = this.closest('.tool-section');
            const options = section.querySelectorAll('.tool-option');

            // Remove active class from all options in this section
            options.forEach(opt => opt.classList.remove('active'));

            // Add active class to clicked option
            this.classList.add('active');
        });
    });

    // Add ripple effect to all size buttons
    sizeButtons.forEach(button => {
        button.addEventListener('click', createRipple);

        // Handle click to set active state
        button.addEventListener('click', function() {
            // Remove active class from all size buttons
            sizeButtons.forEach(btn => btn.classList.remove('active'));

            // Add active class to clicked button
            this.classList.add('active');

            // Update selection display
            const selectionDisplay = document.getElementById('selection-size-display');
            if (selectionDisplay) {
                selectionDisplay.textContent = `Selection: ${this.querySelector('span').textContent}`;
            }
        });
    });

    // Add hover animations
    function addHoverAnimation(element) {
        element.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        });

        element.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    }

    // Apply hover animations
    toolOptions.forEach(addHoverAnimation);
    sizeButtons.forEach(addHoverAnimation);
});

// Enhanced animations for tool options
// This is optional additional animation code you can add to scripts.js for even better UI interactions

// Add hover animations to buttons
function addHoverAnimation() {
    const buttons = document.querySelectorAll('.tool-option, .size-btn, .btn');

    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        });

        button.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    });
}

// Add subtle parallax effect to icons
function addParallaxEffect() {
    const icons = document.querySelectorAll('.tool-icon');

    document.addEventListener('mousemove', e => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;

        icons.forEach(icon => {
            icon.style.transform = `translate(${x * 5}px, ${y * 5}px)`;
        });
    });
}

// Highlight currently hovered section
function highlightCurrentSection() {
    const sections = document.querySelectorAll('.tool-section');

    sections.forEach(section => {
        section.addEventListener('mouseenter', function() {
            const title = this.querySelector('h3');
            title.style.color = '#2bc0ff';
            title.style.textShadow = '0 0 5px rgba(43, 192, 255, 0.3)';
        });

        section.addEventListener('mouseleave', function() {
            const title = this.querySelector('h3');
            title.style.color = '#0ab0ef';
            title.style.textShadow = '';
        });
    });
}

// Initialize enhanced animations
document.addEventListener('DOMContentLoaded', function() {
    addHoverAnimation();
    addParallaxEffect();
    highlightCurrentSection();
});

// Add this to the end of your scripts.js file for the collapsible panel functionality

// Collapsible panel functionality
document.addEventListener('DOMContentLoaded', function() {
    const toolPanel = document.getElementById('toolPanel');
    const panelToggle = document.getElementById('panelToggle');
    const arrowIcon = document.querySelector('.arrow-icon');

    // Function to toggle panel expansion
    function togglePanel() {
        toolPanel.classList.toggle('expanded');

        // Remove blinking once user has interacted with it
        arrowIcon.classList.remove('blink');

        // Store the state in localStorage to remember user preference
        localStorage.setItem('panelExpanded', toolPanel.classList.contains('expanded'));
    }

    // Toggle on click
    panelToggle.addEventListener('click', togglePanel);

    // Also expand on hover for easier access
    toolPanel.addEventListener('mouseenter', function() {
        if (!toolPanel.classList.contains('expanded')) {
            toolPanel.classList.add('expanded');
            // Remove blinking once user has interacted with it
            arrowIcon.classList.remove('blink');
        }
    });

    // Option to collapse on mouse leave if user moves far enough away
    // Uncomment this if you want it to auto-collapse when mouse leaves
    /*
    toolPanel.addEventListener('mouseleave', function(e) {
        // Only collapse if mouse is more than 100px away from panel
        if (e.clientY < toolPanel.getBoundingClientRect().top - 100) {
            toolPanel.classList.remove('expanded');
        }
    });
    */

    // Check localStorage to restore previous state
    const wasExpanded = localStorage.getItem('panelExpanded') === 'true';
    if (wasExpanded) {
        toolPanel.classList.add('expanded');
        arrowIcon.classList.remove('blink');
    }

    // Auto-expand the first time for discovery
    setTimeout(() => {
        if (localStorage.getItem('firstVisit') !== 'true') {
            toolPanel.classList.add('expanded');
            setTimeout(() => {
                if (toolPanel.classList.contains('expanded')) {
                    toolPanel.classList.remove('expanded');
                }
            }, 2000);
            localStorage.setItem('firstVisit', 'true');
        }
    }, 1000);
});

// Create ripple effect for buttons
function createRipple(event) {
    const button = event.currentTarget;

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - diameter / 2}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - diameter / 2}px`;
    circle.classList.add('ripple');

    // Remove existing ripples
    const ripple = button.querySelector('.ripple');
    if (ripple) {
        ripple.remove();
    }

    button.appendChild(circle);
}

// Add ripple effect to all clickable elements
document.addEventListener('DOMContentLoaded', function() {
    const allButtons = document.querySelectorAll('.tool-option, .size-btn, .btn, .panel-toggle');
    allButtons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
});

