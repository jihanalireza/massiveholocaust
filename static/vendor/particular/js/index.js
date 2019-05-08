Number.prototype.map = function(in_min, in_max, out_min, out_max) {
	return (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

//post processing
class Composer {
	constructor(opts) {
		this.renderer = opts.renderer;
		this.scene = opts.scene;
		this.camera = opts.camera;
		this.params = opts.params || {
			bloom: {
				bloomStrength: 1.0,
				bloomThreshold: 0,
				bloomRadius: 0
			},
			chromaticAberration: {
				power: 1
			}
		};
		this.init();
	}

	init() {
		this.composer = new THREE.EffectComposer(this.renderer);
		this.renderPass = new THREE.RenderPass(this.scene, this.camera);

		this.chromaticAberration = {
			uniforms: {
				tDiffuse: { type: "t", value: null },
				resolution: {
					value: new THREE.Vector2(
						window.innerWidth,
						window.innerHeight
					)
				},
				power: {
					type:"f", value: this.params.chromaticAberration.power
				}
			},

			vertexShader: document.querySelector("#chromatic_aberration_vs").textContent,
			fragmentShader: document.querySelector("#chromatic_aberration_fs").textContent
		};
		this.chromaticAberrationPass = new THREE.ShaderPass(this.chromaticAberration);

		this.bloomPass = new THREE.UnrealBloomPass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			1.5,
			0.4,
			0.85
		);
		this.bloomPass.threshold = this.params.bloom.bloomThreshold;
		this.bloomPass.strength = this.params.bloom.bloomStrength;
		this.bloomPass.radius = this.params.bloom.bloomRadius;

		this.antialiasPass = new THREE.ShaderPass(THREE.FXAAShader);
		this.antialiasPass.material.uniforms["resolution"].value.x =
			1 / (window.innerWidth);
		this.antialiasPass.material.uniforms["resolution"].value.y =
			1 / (window.innerHeight);

		this.composer.addPass(this.renderPass);
		this.composer.addPass(this.antialiasPass);
		this.composer.addPass(this.bloomPass);
		this.composer.addPass(this.chromaticAberrationPass);
		this.composer.passes[this.composer.passes.length - 1].renderToScreen = true;
	}

	render() {
		this.composer.render();
	}
}

//object loader
class ObjectLoader {
	constructor() {}

	load(opts) {
		let url = opts.url;
		let format = opts.format;
		if (format === "obj") {
			this.loader = new THREE.OBJLoader();
		} else if (format === "gltf") {
			this.loader = new THREE.GLTFLoader();
		}
		return new Promise((resolve, reject) => {
			this.loader.load(
				url,
				object => {
					resolve(object.scene);
				},
				xhr => {},
				error => {
					reject(error);
				}
			);
		});
	}
}
const objectLoader = new ObjectLoader();

//time manager
class Clock {
	constructor(speed) {
		this.time = 0;
		this.now;
		this.dt;
		this.last = this.timestamp();
		this.step = 1 / 60;
		this.speed = speed || 0.0001;
		this.isPause = true;
	}

	timestamp() {
		return window.performance && window.performance.now
			? window.performance.now()
			: new Date().getTime();
	}

	update() {
		this.now = this.timestamp();
		let speed;
		Boolean(this.isSlowmo) ? (speed = 0.000001) : (speed = this.speed);
		this.dt = Math.min(1, (this.now - this.last) * speed);
		while (this.dt > this.step) {
			this.dt = this.dt - this.step;
		}
		this.last = this.now;
		Boolean(this.isPause) ? (this.dt = 0) : null;
		this.time += this.dt;
		return this;
	}

	pause() {
		this.isPause = true;
		return this;
	}

	start() {
		this.isPause = false;
		return this;
	}
}

//main app
class App {
	constructor() {
		this.clock = new Clock(0.0001).start();
		this.init();
		this.simplex = new SimplexNoise();
		window.addEventListener("resize", this.onWindowResize.bind(this), false);
	}

	init() {
		// renderer
		this.renderer = new THREE.WebGLRenderer({antialias:true});
		this.renderer.toneMapping = THREE.ReinhardToneMapping;
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);

		// scene
		this.scene = new THREE.Scene();

		// camera
		this.camera = new THREE.PerspectiveCamera(
			40,
			window.innerWidth / window.innerHeight,
			1,
			10000
		);
		this.camera.position.set(2, 2, 2);

		// controls
		this.controls = new THREE.OrbitControls(this.camera);
		this.controls.enabled = true;

		// ambient light
		this.scene.add(new THREE.AmbientLight(0x222222));

		// directional light
		this.light = new THREE.DirectionalLight(0xffffff, 1);
		this.light.position.set(20, 20, 0);
		this.scene.add(this.light);

		// axes
		// this.scene.add(new THREE.AxesHelper(20));

		//add sphere
		this.sphere = new Sphere({ s: 400 });
		this.scene.add(this.sphere);

		//composer
		this.composer = new Composer({
			renderer: this.renderer,
			scene: this.scene,
			camera: this.camera,
			params: {
			bloom: {
				bloomStrength: 0.2,
				bloomThreshold: 0,
				bloomRadius: 0
				},
				chromaticAberration: {
					power: 0.5
				}
			}
		});

		//GUI
		this.setupGUI();

		//animation loop
		this.renderer.setAnimationLoop(this.render.bind(this));
	}

	render() {
		this.clock.update();
		this.time = this.clock.time;
		this.sphere.update(this.time);
		
		// this.composer.chromaticAberrationPass.uniforms.power.value = Math.abs(this.simplex.noise2D(0,this.time))*2

		Boolean(this._params.composer)
			? this.composer.render()
			: this.renderer.render(this.scene, this.camera);
	}

	setupGUI() {
		this.gui = new dat.GUI();
		// this.gui.close();
		this._params = {
			composer: true,
			pause: false,
			timeSpeed: 0.0001,
			slowmo: false,
			bloom: this.composer.params.bloom
		};

		let time = this.gui.addFolder("Time");
		let postprocessing = this.gui.addFolder("Post-processing");
		let camera = this.gui.addFolder("Camera");

		postprocessing.add(this._params, "composer").name("post-processing");

		let bloom = postprocessing.addFolder("Bloom");
		bloom.add(this._params.bloom, "bloomThreshold", 0.0, 1.0).name('threshold').onChange(value => {
			this.composer.bloomPass.threshold = Number(value);
		});
		bloom.add(this._params.bloom, "bloomStrength", 0.0, 3.0).name('strength').onChange(value => {
			this.composer.bloomPass.strength = Number(value);
		});
		bloom
			.add(this._params.bloom, "bloomRadius", 0.0, 1.0)
			.name('radius')
			.step(0.01)
			.onChange(value => {
				this.composer.bloomPass.radius = Number(value);
			});
		
		let chroma = postprocessing.addFolder("Chromatic aberration");
		chroma.add(this.composer.chromaticAberrationPass.uniforms.power,'value',0,2).listen();

		time
			.add(this._params, "pause")
			.name("pause")
			.onChange(() => {
				this._params.pause ? this.clock.pause() : this.clock.start();
			});
		time
			.add(this._params, "slowmo")
			.name("slow motion")
			.onChange(() => {
				this._params.slowmo
					? (this.clock.isSlowmo = true)
					: (this.clock.isSlowmo = false);
			});
		time
			.add(this._params, "timeSpeed")
			.name("time speed")
			.min(0.0001)
			.max(1)
			.onChange(() => {
				this.clock.speed = this._params.timeSpeed;
			});

		camera.add(this.controls, "enabled").name("controls");
	}

	onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}
}

class Sphere extends THREE.Object3D {
	constructor({ s }) {
		super();
		this.segments = s;
		this.uniforms = {
			time: { type: "f", value: 0.0 },
			pointSize: { type: "f", value: 2 },
			big: {
				type: "v3",
				value: new THREE.Vector3(207, 221, 212).multiplyScalar(1 / 0xff)
			},
			small: {
				type: "v3",
				value: new THREE.Vector3(213, 239, 229).multiplyScalar(1 / 0xff)
			}
		};
		this.render();
	}

	render() {
		this.geometry = new THREE.SphereBufferGeometry(
			1,
			this.segments,
			this.segments
		);
		this.material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: document.getElementById("vertexShader").textContent,
			fragmentShader: document.getElementById("fragmentShader").textContent,
			transparent: true,
			blending: THREE.AdditiveBlending
		});

		let array = getSphere((this.segments + 1) * (this.segments + 1), 1);
		// this.geometry.addAttribute("pos", new THREE.BufferAttribute(array, 3));
		this.geometry.addAttribute(
			"origin",
			new THREE.BufferAttribute(
				getSphere((this.segments + 1) * (this.segments + 1), 1),
				3
			)
		);

		this.particles = new THREE.Points(this.geometry, this.material);
		this.add(this.particles);
	}

	update(t) {
		this.uniforms.time.value = t;
	}
}

function getPoint(v, size) {
	v.x = Math.random() * 2 - 1;
	v.y = Math.random() * 2 - 1;
	v.z = Math.random() * 2 - 1;
	// if (v.length() > 1) return getPoint(v, size);
	return v;
}

//returns a Float32Array buffer of spherical 3D points
function getSphere(count, size) {
	var len = count * 3;
	var data = new Float32Array(len);
	var p = new THREE.Vector3();
	for (var i = 0; i < len; i += 3) {
		getPoint(p, size);
		data[i] = p.x;
		data[i + 1] = p.y;
		data[i + 2] = p.z;
	}
	return data;
}

//init app
const app = new App();