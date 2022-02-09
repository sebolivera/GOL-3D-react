import React, { createRef, Component } from "react";
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
    IconButton,
} from "@mui/material/";
import "rc-slider/assets/index.css";
import Slider, { Range, SliderTooltip } from "rc-slider";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Draggable from "react-draggable";
const { Handle } = Slider;
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
        this.opacity = 0.65;
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
            2: 0.1,
            3: 0.75,
            4: 0.1,
            5: 0.2,
            6: 0.3,
            7: 0.4,
            8: 0.5,
            9: 1,
        };
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
        menuShowText: "Show",
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
        this.maxTimer = Math.round(1 / this.speedSlider[e]);
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
        this.opacity = e;
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
        this.minDeath = Math.min(e[0], e[1]);
        this.maxDeath = Math.max(e[0], e[1]);
    };

    updateLife = (e) => {
        this.minLive = Math.min(e[0], e[1]);
        this.maxLive = Math.max(e[0], e[1]);
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
        if (this.state.menuShowText === "Show") {
            menuTextVal = "Hide";
        } else {
            menuTextVal = "Show";
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
    componentDidMount = async () => {
        setTimeout(() => {
            document.getElementById("pannel").classList.add("mainPannel");
        }, 3000);
        this.updateWindowDimensions();
        this.updateWindowDimensions = this.updateWindowDimensions.bind(this);
        document.addEventListener("keydown", this.handlePress, false);
    };

    handleSpeed(props) {
        const { value, dragging, index, ...restProps } = props;
        let txtValues = {
            0: "Ultra Slow",
            1: "Super Slow",
            2: "Slow",
            3: "Normal",
            4: "Slightly Faster",
            5: "Faster",
            6: "Fast",
            7: "Very Fast",
            8: "Stupid Fast",
            9: "Why",
        };
        return (
            <SliderTooltip
                prefixCls="rc-slider-tooltip"
                overlay={txtValues[value]}
                placement="top"
                key={index}
            >
                <Handle value={value} {...restProps} />
            </SliderTooltip>
        );
    }

    handleSliders(
        props //grief has 5 different states
    ) {
        const { value, dragging, index, ...restProps } = props;
        return (
            <SliderTooltip
                prefixCls="rc-slider-tooltip"
                overlay={value}
                visible={dragging}
                placement="top"
                key={index}
            >
                <Handle value={value} {...restProps} />
            </SliderTooltip>
        );
    }

    render() {
        return (
            <>
                <div className="mainContainer">
                    <Draggable cancel=".rc-slider">
                        <Box
                            container
                            sx={{
                                width: "33%",
                                bgcolor: "text.secondary",
                                padding: "1vw",
                            }}
                            className="container"
                        >
                            <Box id="pannel">
                                <label htmlFor="icon-button-toggle">
                                    <IconButton
                                        color="primary"
                                        aria-label="hide show pannel"
                                        component="span"
                                        onClick={this.handleCollapse}
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
                                    </IconButton>
                                </label>
                                <div className="noHover">
                                    <Collapse in={this.state.menuCollapse}>
                                        <Grid
                                            className="instructions"
                                            item
                                            xs={12}
                                        >
                                            <p>
                                                Press 'r' to restart (re-seed
                                                the board)
                                            </p>
                                            <p>Press 'p' to pause</p>
                                            <p>
                                                Use mouse to orbit around the
                                                cube
                                            </p>
                                        </Grid>

                                        <Grid container spacing={2}>
                                            <Grid item xs={6}>
                                                <label>Speed</label>
                                                <Slider
                                                    id="speedSlider"
                                                    className="rc-slider"
                                                    min={0}
                                                    max={9}
                                                    marks={this.speedSlider}
                                                    defaultValue={3}
                                                    step={null}
                                                    onChange={this.updateSpeed.bind(
                                                        this
                                                    )}
                                                    handle={this.handleSpeed.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>
                                            <Grid item xs={6}>
                                                <label>Opacity</label>
                                                <Slider
                                                    id="opacitySlider"
                                                    className="rc-slider"
                                                    min={0}
                                                    max={1}
                                                    defaultValue={0.65}
                                                    step={0.01}
                                                    onChange={(e) =>
                                                        this.updateOpacity(e)
                                                    }
                                                    handle={this.handleSliders.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>
                                            <Grid item xs={6}>
                                                <label>Death range</label>
                                                <Range
                                                    id="deathSlider"
                                                    className="rc-slider"
                                                    min={0}
                                                    max={26}
                                                    range={true}
                                                    inverted={true}
                                                    defaultValue={[4, 8]}
                                                    trackStyle={{
                                                        backgroundColor: "grey",
                                                    }}
                                                    railStyle={{
                                                        backgroundColor: "red",
                                                    }}
                                                    step={1}
                                                    onChange={this.updateDeath.bind(
                                                        this
                                                    )}
                                                    handle={this.handleSliders.bind(
                                                        this
                                                    )}
                                                />
                                            </Grid>
                                            <Grid item xs={6}>
                                                <label>Life range</label>
                                                <Range
                                                    id="lifeSlider"
                                                    className="rc-slider"
                                                    min={0}
                                                    max={26}
                                                    range={true}
                                                    inverted={true}
                                                    defaultValue={[6, 6]}
                                                    railStyle={{
                                                        backgroundColor: "grey",
                                                    }}
                                                    trackStyle={{
                                                        backgroundColor:
                                                            "green",
                                                    }} //broken :/
                                                    minimumTrackStyle={{
                                                        backgroundColor:
                                                            "green",
                                                    }}
                                                    step={1}
                                                    onChange={this.updateLife.bind(
                                                        this
                                                    )}
                                                    handle={this.handleSliders.bind(
                                                        this
                                                    )}
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
                                                                    Color scheme
                                                                </InputLabel>
                                                                <Select
                                                                    MenuProps={{
                                                                        style: {
                                                                            zIndex: 35001,
                                                                        },
                                                                    }}
                                                                    value={
                                                                        this
                                                                            .state
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
                                                                        Rainbow
                                                                    </MenuItem>
                                                                    <MenuItem value="black">
                                                                        Black
                                                                    </MenuItem>
                                                                    <MenuItem value="white">
                                                                        White
                                                                    </MenuItem>
                                                                    <MenuItem value="random">
                                                                        Random
                                                                    </MenuItem>
                                                                    <MenuItem value="randomBlackAndWhite">
                                                                        Random
                                                                        black
                                                                        and
                                                                        white
                                                                    </MenuItem>
                                                                    <MenuItem value="randomRGB">
                                                                        Random
                                                                        RGB
                                                                    </MenuItem>
                                                                    <MenuItem value="what">
                                                                        Even
                                                                        more
                                                                        random
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
                                                        label="Show dead cubes (decreases performance)"
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
                                                        label="Auto-reset on stalemate"
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
                                                        label="Show outline"
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
            </>
        );
    }
}

export default Game;
