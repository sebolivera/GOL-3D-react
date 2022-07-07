import { createRef, Component } from "react";
import {
    getRandomInt,
    getRandomBMInt,
    proximityIndex,
    neighbors3D,
} from "./Utils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as THREE from "three";
import "./Game.css";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import {
    Checkbox,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    FormControl,
    Box,
    Select,
    Collapse,
    Button,
    Slider,
} from "@mui/material/";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Draggable from "react-draggable";
class Game extends Component {
    constructor(props) {
        super(props);
        this.divElement = createRef();
        this.showDead = false;
        this.cubeHeight = 10;
        this.resetOnStaleMate = true;
        this.reset = false;
        this.cubeWidth = 10;
        this.cubeDepth = 10;
        this.outLine = true;
        this.opacity = 1;
        this.cubeMatrix = [];
        for (let i = 0; i < this.cubeWidth; i++) {
            let plane = [];
            for (let j = 0; j < this.cubeHeight; j++) {
                let row = [];
                for (let k = 0; k < this.cubeDepth; k++) {
                    row.push(0);
                }
                plane.push(row);
            }
            this.cubeMatrix.push(plane);
        }
        this.speedSlider = {
            0: 0.01,
            1: 0.025,
            2: 0.05,
            3: 0.075,
            4: 0.1,
            5: 0.2,
            6: 0.3,
            7: 0.4,
            8: 0.5,
            9: 1,
        };

        this.sliderRanges = [
            {
                value: 0,
                label: "Ultra lent",
            },
            {
                value: 1,
                label: "Super lent",
            },
            {
                value: 2,
                label: "Lent",
            },
            {
                value: 3,
                label: "Normal",
            },
            {
                value: 4,
                label: "Légèrement rapide",
            },
            {
                value: 5,
                label: "Rapide",
            },
            {
                value: 6,
                label: "Plus rapide",
            },
            {
                value: 7,
                label: "Très rapide",
            },
            {
                value: 8,
                label: "Trop rapide",
            },
            {
                value: 9,
                label: "Non",
            },
        ];
        this.maxDeath = 8;
        this.minDeath = 4;
        this.minLive = 6;
        this.maxLive = 6;
        this.timer = 0;
        this.maxTimer = 4;
        this.clusterStarterPercentage = 0.1;
        this.maxClusterSize = 10;
        this.clusterDensity = 1;
        this.paused = false;
        this.renderer = new THREE.WebGLRenderer();
        this.camera = undefined;
        this.scene = new THREE.Scene();
        this.effect = undefined;
        this.controls = undefined;
        this.frameId = undefined;
        this.animate = this.animate.bind(this);
        this.renderScene = this.renderScene.bind(this);
        this.handlePress = this.handlePress.bind(this);
        this.updateCubes = this.updateCubes.bind(this);
        this.seedMatrix = this.seedMatrix.bind(this);
        this.seedClusters = this.seedClusters.bind(this);
        this.updateOpacity = this.updateOpacity.bind(this);
        this.geometry = new THREE.BoxGeometry(9, 9, 9);
        this.cubeCollection = [];
        const format = this.renderer.capabilities.isWebGL2
            ? THREE.RedFormat
            : THREE.LuminanceFormat;
        for (
            let i = -(this.cubeHeight / 2), alphaIndex = 0;
            i < this.cubeHeight / 2;
            i++, alphaIndex += 0.1
        ) {
            let cubeSlice = [];
            for (let j = -(this.cubeWidth / 2); j < this.cubeWidth / 2; j++) {
                let cubeLine = [];

                const colors = new Uint8Array(alphaIndex + 2);

                for (let c = 0; c <= colors.length; c++) {
                    colors[c] = (c / colors.length) * 256;
                }

                const gradientMap = new THREE.DataTexture(
                    colors,
                    colors.length,
                    1,
                    format
                );
                gradientMap.needsUpdate = true;
                for (
                    let k = -(this.cubeDepth / 2);
                    k < this.cubeDepth / 2;
                    k++
                ) {
                    const diffuseColor = this.colorPicker(i, j, k);

                    const material = new THREE.MeshToonMaterial({
                        color: diffuseColor,
                        gradientMap: gradientMap,
                        opacity: this.opacity,
                        transparent: true,
                    });

                    material.userData.outlineParameters = {
                        //NOT IN THE FUCKING DOCUMENTATION
                        thickness: 0.002,
                        keepAlive: true,
                    };
                    let cube = new THREE.Mesh(this.geometry, material);
                    cube.position.set(i * 10, j * 10, k * 10);
                    cubeLine.push(cube);
                }
                cubeSlice.push(cubeLine);
            }
            this.cubeCollection.push(cubeSlice);
        }
    }

    state = {
        width: 0,
        height: 0,
        cubeColorScheme: "rainbow",
        menuCollapse: false,
        arrowPoint: 180,
        menuShowText: "Afficher le",
    };

    initSpace = () => {
        this.scene.background = new THREE.Color(0x444488);
        this.renderer.setSize(this.state.width, this.state.height);
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.state.width / this.state.height,
            1,
            10000
        );
        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );
        this.camera.position.z = 150;
        this.controls.update();
        this.divElement.appendChild(this.renderer.domElement);
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    this.scene.add(this.cubeCollection[i][j][k]);
                }
            }
        }
        const light = new THREE.AmbientLight(0xdddddd); //xdddddddddddd
        this.scene.add(light);
        this.effect = new OutlineEffect(this.renderer);
        this.seedMatrix();
    };

    seedMatrix() {
        let frozenMatrix = [];
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            let frozenPlane = [];
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                let frozenRow = [];
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    frozenRow.push(0);
                }
                frozenPlane.push(frozenRow);
            }
            frozenMatrix.push(frozenPlane);
        }

        let height = frozenMatrix.length;
        let width = frozenMatrix[0].length;
        let depth = frozenMatrix[0][0].length;
        let liveCells =
            (this.clusterStarterPercentage / 100) * (width * height * depth);
        let listSeeds = [];
        while (liveCells > 0) {
            let x = getRandomInt(height);
            let y = getRandomInt(width);
            let z = getRandomInt(depth);
            if (frozenMatrix[x][y][z] !== 1) {
                frozenMatrix[x][y][z] = 1;
                listSeeds.push([x, y, z]);
                liveCells--;
            }
        }
        this.seedClusters(frozenMatrix, listSeeds);
    }

    seedClusters = (listSeeds) => {
        let frozenMatrix = [];
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            let frozenPlane = [];
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                let frozenRow = [];
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    frozenRow.push(this.cubeMatrix[i][j][k]);
                }
                frozenPlane.push(frozenRow);
            }
            frozenMatrix.push(frozenPlane);
        }

        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    listSeeds.forEach((row) => {
                        row.forEach((e) => {
                            let clusterSize = getRandomBMInt(
                                this.maxClusterSize
                            );
                            let pIndex = proximityIndex(
                                e,
                                [i, j, k],
                                clusterSize,
                                this.clusterDensity
                            ); //Isn't actually all that useful in small grids
                            if (pIndex > 0) {
                                let r = Math.random();
                                if (r <= pIndex || e.toString() === [i, j, k]) {
                                    this.cubeMatrix[i][j][k] = 1;
                                }
                            }
                            this.cubeMatrix[e[0]][e[1]][e[2]] = 1;
                        });
                    });
                }
            }
        }
        this.start();
    };

    start() {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.animate);
        }
    }
    stop() {
        cancelAnimationFrame(this.frameId);
    }

    renderScene() {
        this.renderer.render(this.scene, this.camera);
        this.effect.render(this.scene, this.camera);
    }

    updateCubes() {
        let frozenMatrix = [];
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            let frozenPlane = [];
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                let frozenRow = [];
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    frozenRow.push(this.cubeMatrix[i][j][k]);
                }
                frozenPlane.push(frozenRow);
            }
            frozenMatrix.push(frozenPlane);
        }
        let dead = true;
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    let neighbours = neighbors3D(i, j, k, this.cubeMatrix);
                    if (
                        neighbours <= this.minDeath ||
                        neighbours > this.maxDeath
                    ) {
                        this.cubeMatrix[i][j][k] = 0;
                    } else if (
                        neighbours >= this.minLive &&
                        neighbours <= this.maxLive
                    ) {
                        this.cubeMatrix[i][j][k] = 1;
                    }
                    let child = this.scene.getObjectById(
                        this.cubeCollection[i][j][k].id
                    ); //this wasn't fucking documented
                    if (child !== undefined) {
                        if (this.cubeMatrix[i][j][k] === 1) {
                            child.scale.set(1, 1, 1);
                            child.visible = true;
                        } else {
                            if (this.showDead) {
                                child.scale.set(0.1, 0.1, 0.1);
                                child.visible = true;
                            } else {
                                child.visible = false;
                            }
                        }
                    }
                }
            }
        }

        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    if (this.cubeMatrix[i][j][k] !== frozenMatrix[i][j][k]) {
                        dead = false;
                    }
                }
            }
        }
        if (dead && this.resetOnStaleMate) {
            this.reset = true;
            this.resetMatrix();
            this.seedMatrix();
        }
    }

    animate() {
        this.controls.update();
        if (this.timer === 0 && !this.paused) {
            this.updateCubes();
        }
        this.timer++;
        this.timer %= this.maxTimer;
        this.renderScene();
        if (!this.reset) this.frameId = requestAnimationFrame(this.animate);
    }

    componentWillUnmount() {
        this.clearThree(this.scene);
        this.stop();
        window.removeEventListener("resize", this.onResize);
        document.removeEventListener("keydown", this.handlePress, false);
    }
    clearThree(obj) {
        while (obj.children.length > 0) {
            this.clearThree(obj.children[0]);
            obj.remove(obj.children[0]);
        }
        if (obj.geometry) obj.geometry.dispose();

        if (obj.material) {
            Object.keys(obj.material).forEach((prop) => {
                if (!obj.material[prop]) return;
                if (
                    obj.material[prop] !== null &&
                    typeof obj.material[prop].dispose === "function"
                )
                    obj.material[prop].dispose();
            });
            obj.material.dispose();
        }
    }

    colorPicker(i, j, k) {
        let diffuseColor;
        switch (this.state.cubeColorScheme) {
            case "rainbow":
                diffuseColor = new THREE.Color()
                    .setHSL(i * 0.1, 0.5, 0.5)
                    .multiplyScalar(1 - j * 0.02);
                break;
            case "random":
                diffuseColor = new THREE.Color()
                    .setHSL(Math.random(), 0.5, 0.5)
                    .multiplyScalar(1 - j * 0.02);
                break;
            case "white":
                diffuseColor = new THREE.Color().setHSL(1, 1, 1);
                break;
            case "black":
                diffuseColor = new THREE.Color().setHSL(0, 0, 0);
                break;
            case "chessboard":
                if ((i + j + k) % 2 === 0) {
                    diffuseColor = new THREE.Color().setHSL(0, 0, 0);
                } else {
                    diffuseColor = new THREE.Color().setHSL(1, 1, 1);
                }
                break;
            case "randomBlackAndWhite":
                if (Math.random() < 0.5) {
                    diffuseColor = new THREE.Color()
                        .setHSL(0, 0, 0)
                        .multiplyScalar(0);
                } else {
                    diffuseColor = new THREE.Color()
                        .setHSL(1, 1, 1)
                        .multiplyScalar(1);
                    break;
                }
                break;
            case "randomRGB":
                let n = Math.random();
                if (n < 0.333333) {
                    //red
                    diffuseColor = new THREE.Color()
                        .setHSL(0, 1, 0.5)
                        .multiplyScalar(1);
                } else if (n < 0.666666) {
                    //green
                    diffuseColor = new THREE.Color()
                        .setHSL(0.333, 1, 0.5)
                        .multiplyScalar(1);
                    break;
                } else {
                    //blue
                    diffuseColor = new THREE.Color()
                        .setHSL(0.66, 1, 0.5)
                        .multiplyScalar(1);
                }
                break;
            case "what":
                diffuseColor = new THREE.Color().setHSL(
                    Math.random(),
                    Math.random(),
                    Math.random()
                );
                break;
            default:
                diffuseColor = new THREE.Color()
                    .setHSL(i * 0.1, 0.5, 0.5)
                    .multiplyScalar(1 - j * 0.02);
                break;
        }
        return diffuseColor;
    }
    resetMatrix() {
        cancelAnimationFrame(this.frameId);
        this.frameId = false;
        this.clearThree(this.scene);
        this.renderer.state.reset();
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    this.cubeMatrix[i][j][k] = 0;
                }
            }
        }
        this.cubeCollection = [];
        const format = this.renderer.capabilities.isWebGL2
            ? THREE.RedFormat
            : THREE.LuminanceFormat;
        for (
            let i = -(this.cubeHeight / 2), alphaIndex = 0;
            i < this.cubeHeight / 2;
            i++, alphaIndex += 0.1
        ) {
            let cubeSlice = [];
            for (let j = -(this.cubeWidth / 2); j < this.cubeWidth / 2; j++) {
                let cubeLine = [];

                const colors = new Uint8Array(alphaIndex * 0.1 + 2);

                for (let c = 0; c <= colors.length; c++) {
                    colors[c] = (c / colors.length) * 256;
                }

                const gradientMap = new THREE.DataTexture(
                    colors,
                    colors.length,
                    1,
                    format
                );
                gradientMap.needsUpdate = true;
                for (
                    let k = -(this.cubeDepth / 2);
                    k < this.cubeDepth / 2;
                    k++
                ) {
                    //const color = new Uint8Array( alphaIndex + 2 );
                    const diffuseColor = this.colorPicker(i, j, k);

                    const material = new THREE.MeshToonMaterial({
                        color: diffuseColor,
                        gradientMap: gradientMap,
                        opacity: this.opacity,
                        transparent: true,
                    });

                    material.userData.outlineParameters = {
                        //NOT IN THE FUCKING DOCUMENTATION
                        thickness: 0.002,
                        keepAlive: true,
                    };

                    //const mesh = new THREE.Mesh(this.geometry, material);
                    let cube = new THREE.Mesh(this.geometry, material);
                    cube.position.set(i * 10, j * 10, k * 10);
                    cubeLine.push(cube);
                    this.scene.add(cube);
                }
                cubeSlice.push(cubeLine);
            }
            this.cubeCollection.push(cubeSlice);
        }
        const light = new THREE.AmbientLight(0xdddddd); //aaaaaaaaaaa
        this.scene.add(light);
        this.reset = false;
        this.seedMatrix();
    }

    handlePress(e) {
        if (e.key === "p") {
            this.paused = !this.paused;
        }
        if (e.key === "r") {
            this.reset = true;
            this.resetMatrix();
        }
        if (e.key === "+") {
            this.maxTimer /= 2;
        }

        if (e.key === "-") {
            this.maxTimer *= 2;
        }
    }

    updateWindowDimensions() {
        this.setState(
            {
                width: this.divElement.clientWidth,
                height: this.divElement.clientHeight,
            },
            this.initSpace
        );
    }

    updateSpeed = (e) => {
        let v = e.target.value;
        this.maxTimer = Math.round(1 / this.speedSlider[v]);
    };

    updateOutline = (e) => {
        this.outLine = !this.outLine;
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    let neighbours = neighbors3D(i, j, k, this.cubeMatrix);
                    if (
                        neighbours <= this.minDeath ||
                        neighbours > this.maxDeath
                    ) {
                        this.cubeMatrix[i][j][k] = 0;
                    } else if (
                        neighbours >= this.minLive &&
                        neighbours <= this.maxLive
                    ) {
                        this.cubeMatrix[i][j][k] = 1;
                    }
                    let child = this.scene.getObjectById(
                        this.cubeCollection[i][j][k].id
                    );
                    if (this.outLine) {
                        child.material.userData.outlineParameters.thickness = 0.002;
                    } else {
                        child.material.userData.outlineParameters.thickness = 0;
                    }
                }
            }
        }
    };

    updateDead = (e) => {
        this.showDead = !this.showDead;
    };

    updateOpacity = (e) => {
        this.opacity = e.target.value;
        for (let i = 0; i < this.cubeMatrix.length; i++) {
            for (let j = 0; j < this.cubeMatrix[0].length; j++) {
                for (let k = 0; k < this.cubeMatrix[0][0].length; k++) {
                    let neighbours = neighbors3D(i, j, k, this.cubeMatrix);
                    if (
                        neighbours <= this.minDeath ||
                        neighbours > this.maxDeath
                    ) {
                        this.cubeMatrix[i][j][k] = 0;
                    } else if (
                        neighbours >= this.minLive &&
                        neighbours <= this.maxLive
                    ) {
                        this.cubeMatrix[i][j][k] = 1;
                    }
                    let child = this.scene.getObjectById(
                        this.cubeCollection[i][j][k].id
                    );
                    child.material.opacity = this.opacity;
                }
            }
        }
    };

    updateDeath = (e) => {
        let v = e.target.value;
        this.minDeath = Math.min(v[0], v[1]);
        this.maxDeath = Math.max(v[0], v[1]);
    };

    updateLife = (e) => {
        let v = e.target.value;
        this.minLive = Math.min(v[0], v[1]);
        this.maxLive = Math.max(v[0], v[1]);
    };

    setColors() {
        const format = this.renderer.capabilities.isWebGL2
            ? THREE.RedFormat
            : THREE.LuminanceFormat;
        for (
            let i = -(this.cubeHeight / 2), alphaIndex = 0, ii = 0;
            i < this.cubeHeight / 2;
            i++, ii++, alphaIndex += 0.1
        ) {
            for (
                let j = -(this.cubeWidth / 2), jj = 0;
                j < this.cubeWidth / 2;
                j++, jj++
            ) {
                const colors = new Uint8Array(alphaIndex + 2);

                for (let c = 0; c <= colors.length; c++) {
                    colors[c] = (c / colors.length) * 256;
                }

                const gradientMap = new THREE.DataTexture(
                    colors,
                    colors.length,
                    1,
                    format
                );
                gradientMap.needsUpdate = true;
                for (
                    let k = -(this.cubeDepth / 2), kk = 0;
                    k < this.cubeDepth / 2;
                    k++, kk++
                ) {
                    const diffuseColor = this.colorPicker(i, j, k);
                    const material = new THREE.MeshToonMaterial({
                        color: diffuseColor,
                        gradientMap: gradientMap,
                        opacity: this.opacity,
                        transparent: true,
                    });

                    material.userData.outlineParameters = {
                        //NOT IN THE FUCKING DOCUMENTATION
                        thickness: 0.002,
                        keepAlive: true,
                    };
                    let child = this.scene.getObjectById(
                        this.cubeCollection[ii][jj][kk].id
                    );
                    child.material = material;
                    if (this.outLine) {
                        child.material.userData.outlineParameters.thickness = 0.002;
                    } else {
                        child.material.userData.outlineParameters.thickness = 0;
                    }
                }
            }
        }
    }

    updateColorScheme = (e) => {
        this.setState({ cubeColorScheme: e.target.value }, this.setColors);
    };

    handleCollapse = (e) => {
        let nval = (this.state.arrowPoint + 180) % 360;
        let menuTextVal;
        if (this.state.menuShowText === "Afficher le") {
            menuTextVal = "Masquer le";
        } else {
            menuTextVal = "Afficher le";
        }
        this.setState({
            menuCollapse: !this.state.menuCollapse,
            arrowPoint: nval,
            menuShowText: menuTextVal,
        });
    };
    updateResetOnStalemate = (e) => {
        this.resetOnStaleMate = !this.resetOnStaleMate;
    };

    pickValue = (index) => {
        return this.sliderRanges[index].label;
    };

    componentDidMount = async () => {
        this.updateWindowDimensions();
        this.updateWindowDimensions = this.updateWindowDimensions.bind(this);
        document.addEventListener("keydown", this.handlePress, false);
    };
    render() {
        return (
            <div className="mainContainer">
                <Draggable cancel=".cancel">
                    <Box
                        container
                        sx={{
                            width: "33%",
                            bgcolor: "rgba(0, 0, 0, 0.6)",
                            padding: "1vw",
                        }}
                        className="container"
                    >
                        <Box id="pannel" className="mainPannel">
                            <label htmlFor="icon-button-toggle">
                                <Button
                                    color="primary"
                                    aria-label="hide show pannel"
                                    component="span"
                                    variant="raised"
                                    onClick={this.handleCollapse}
                                    style={{ backgroundColor: "transparent" }}
                                >
                                    <KeyboardArrowDownIcon
                                        style={{
                                            transform: `rotate(${this.state.arrowPoint}deg)`,
                                            color: `white`,
                                        }}
                                    />
                                    <button className="aNoStyle white-text">
                                        {this.state.menuShowText} menu
                                    </button>
                                    {/* needed an anchor tag here cuz the cursor wouldn't change from pointer to the little hand :( */}
                                </Button>
                            </label>
                            <div className="noHover">
                                <Collapse in={this.state.menuCollapse}>
                                    <Grid className="instructions" item xs={12}>
                                        <p>
                                            Appuyez sur 'r' pour recommencer
                                            (re-générer le cube)
                                        </p>
                                        <p>
                                            Appuyez sur 'p' pour mettre en pause
                                        </p>
                                        <p>
                                            Utilisez la souris pour orbiter
                                            autour du cube
                                        </p>
                                    </Grid>

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <label>Vitesse</label>

                                            <Slider
                                                className="cancel"
                                                id="speedSlider"
                                                min={0}
                                                max={9}
                                                marks={this.sliderRanges}
                                                defaultValue={6}
                                                step={null}
                                                onChange={this.updateSpeed.bind(
                                                    this
                                                )}
                                                valueLabelDisplay="auto"
                                                valueLabelFormat={this.pickValue.bind(
                                                    this
                                                )}
                                                xs={9}
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <label>Opacité</label>
                                            <Slider
                                                className="cancel"
                                                id="opacitySlider"
                                                min={0}
                                                max={1}
                                                defaultValue={1}
                                                step={0.01}
                                                onChange={(e) =>
                                                    this.updateOpacity(e)
                                                }
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <label>
                                                Intervalle de mortalité
                                            </label>
                                            <Slider
                                                className="cancel"
                                                id="deathSlider"
                                                min={0}
                                                max={26}
                                                track="inverted"
                                                marks={null}
                                                defaultValue={[4, 8]}
                                                step={1}
                                                onChange={this.updateDeath.bind(
                                                    this
                                                )}
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <label>Intervalle de vie</label>
                                            <Slider
                                                className="cancel"
                                                id="lifeSlider"
                                                min={0}
                                                max={26}
                                                marks={null}
                                                defaultValue={[6, 6]}
                                                track="inverted"
                                                step={1}
                                            />
                                        </Grid>
                                    </Grid>
                                    <Grid
                                        item
                                        xs={12}
                                        className="controls"
                                        pt={2}
                                    >
                                        <Grid container>
                                            <Grid item xs={6}>
                                                <Grid item xs={9}>
                                                    <Box
                                                        sx={{
                                                            minWidth: 120,
                                                        }}
                                                    >
                                                        <FormControl
                                                            fullWidth
                                                            variant="filled"
                                                            sx={{
                                                                m: 1,
                                                                minWidth: 120,
                                                                zIndex: 10000,
                                                            }}
                                                        >
                                                            <InputLabel id="select-filled-label">
                                                                Coloris
                                                            </InputLabel>
                                                            <Select
                                                                MenuProps={{
                                                                    style: {
                                                                        zIndex: 35001,
                                                                    },
                                                                }}
                                                                value={
                                                                    this.state
                                                                        .cubeColorScheme
                                                                }
                                                                defaultValue="rainbow"
                                                                onChange={this.updateColorScheme.bind(
                                                                    null
                                                                )}
                                                                sx={{
                                                                    color: "white",
                                                                    label: {
                                                                        color: "white",
                                                                    },
                                                                    backgroundColor:
                                                                        "#d3d3d31c",
                                                                    borderRadius:
                                                                        "10px",
                                                                }}
                                                            >
                                                                <MenuItem value="rainbow">
                                                                    Arc-en-ciel
                                                                </MenuItem>
                                                                <MenuItem value="black">
                                                                    Noir
                                                                </MenuItem>
                                                                <MenuItem value="white">
                                                                    Blanc
                                                                </MenuItem>
                                                                <MenuItem value="chessboard">
                                                                    Damier
                                                                </MenuItem>
                                                                <MenuItem value="random">
                                                                    Aléatoire
                                                                </MenuItem>
                                                                <MenuItem value="randomBlackAndWhite">
                                                                    Aléatoire
                                                                    (noir et
                                                                    blanc)
                                                                </MenuItem>
                                                                <MenuItem value="randomRGB">
                                                                    Aléatoire
                                                                    RVB
                                                                </MenuItem>
                                                                <MenuItem value="what">
                                                                    Encore plus
                                                                    aléatoire
                                                                </MenuItem>
                                                            </Select>
                                                        </FormControl>
                                                    </Box>
                                                </Grid>
                                            </Grid>

                                            <Grid item xs={6}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            defaultChecked={
                                                                false
                                                            }
                                                        />
                                                    }
                                                    label="Afficher les cubes morts (affecte les performances)"
                                                    onChange={this.updateDead.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>

                                            <Grid item xs={6}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            defaultChecked
                                                        />
                                                    }
                                                    label="Relancer en cas de blocage"
                                                    onChange={this.updateResetOnStalemate.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>

                                            <Grid item xs={6}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            defaultChecked
                                                        />
                                                    }
                                                    label="Montrer les contours"
                                                    onChange={this.updateOutline.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>
                                        </Grid>
                                    </Grid>
                                </Collapse>
                            </div>
                        </Box>
                    </Box>
                </Draggable>
                <div
                    className="canvasContainer"
                    ref={(divElement) => {
                        this.divElement = divElement;
                    }}
                ></div>
            </div>
        );
    }
}

export default Game;
