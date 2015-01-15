/*jslint browser: true*/
/*global Tangram, gui */

(function () {
    'use strict';

    var locations = {
        'London': [51.508, -0.105, 15],
        'New York': [40.70531887544228, -74.00976419448853, 16],
        'Seattle': [47.609722, -122.333056, 15]
    };

    var map_start_location = locations['New York'];

    /*** URL parsing ***/

    // leaflet-style URL hash pattern:
    // #[zoom],[lat],[lng]
    var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

    if (url_hash.length == 3) {
        map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
        // convert from strings
        map_start_location = map_start_location.map(Number);
    }

    /*** Map ***/

    var map = L.map('map', {
        maxZoom: 20,
        minZoom: 1,
        inertia: false,
        keyboard: true,
        keyboardZoomOffset: .05
    });

    var layer = Tangram.leafletLayer({
        source: {
            type: 'GeoJSONTileSource',
            url:  'http://vector.mapzen.com/osm/all/{z}/{x}/{y}.json'
        },
        scene: 'styles.yaml',
        numWorkers: 2,
        attribution: 'Map data &copy; OpenStreetMap contributors | <a href="https://github.com/tangrams/tangram" target="_blank">Source Code</a>',
        unloadInvisibleTiles: false,
        updateWhenIdle: false
    });

    window.layer = layer;
    var scene = layer.scene;
    window.scene = scene;

    // setView expects format ([lat, long], zoom)
    map.setView(map_start_location.slice(0, 3), map_start_location[2]);

    var hash = new L.Hash(map);

    // Resize map to window
    function resizeMap() {
        document.getElementById('map').style.width = window.innerWidth + 'px';
        document.getElementById('map').style.height = window.innerHeight + 'px';
        map.invalidateSize(false);
    }

    window.addEventListener('resize', resizeMap);
    resizeMap();

    /***** GUI/debug controls *****/

    // Create dat GUI
    var gui = new dat.GUI({ autoPlace: true });
    function addGUI () {
        gui.domElement.parentNode.style.zIndex = 5;
        window.gui = gui;

        // Camera
        var camera_types = {
            'Flat': 'flat',
            'Perspective': 'perspective',
            'Isometric': 'isometric'
        };
        gui.camera = layer.scene.styles.camera.type;
        gui.add(gui, 'camera', camera_types).onChange(function(value) {
            layer.scene.styles.camera.type = value;
            layer.scene.updateStyles();
        });

        // Lighting
        var lighting_presets = {
            'Point': {
                type: 'point',
                position: [0, 0, 200],
                ambient: 0.5,
                backlight: true
            },
            'Directional': {
                type: 'directional',
                direction: [-1, 0, -.5],
                ambient: 0.5
            },
            'Spotlight': {
                type: 'spotlight',
                position: [0, 0, 500],
                direction: [0, 0, -1],
                inner_angle: 20,
                outer_angle: 25,
                ambient: 0.2
            },
            'Night': {
                type: 'point',
                position: [0, 0, 50],
                ambient: 0,
                backlight: false
            }
        };
        var lighting_options = Object.keys(lighting_presets);
        for (var k=0; k < lighting_options.length; k++) {
            if (lighting_presets[lighting_options[k]].type === layer.scene.styles.lighting.type) {
                gui.lighting = lighting_options[k];
                break;
            }
        }
        gui.add(gui, 'lighting', lighting_options).onChange(function(value) {
            layer.scene.styles.lighting = lighting_presets[value];
            layer.scene.updateStyles();
        });

        // Layers
        var layer_gui = gui.addFolder('Layers');
        var layer_controls = {};
        var layer_colors = {};
        layer.scene.layers.forEach(function(l) {
            if (layer.scene.styles.layers[l.name] == null) {
                return;
            }

            layer_controls[l.name] = !(layer.scene.styles.layers[l.name].visible == false);
            layer_gui.
                add(layer_controls, l.name).
                onChange(function(value) {
                    layer.scene.styles.layers[l.name].visible = value;
                    layer.scene.rebuildGeometry();
                });
            var c = layer.scene.styles.layers[l.name].color.default;
            layer_colors[l.name] = [c[0]*255, c[1]*255, c[2]*255];
            console.log(l.name, layer_colors[l.name]);
            layer_gui.
                addColor(layer_colors, l.name).
                onChange(function(value) {
                    layer.scene.styles.layers[l.name].color.default = [value[0]/255, value[1]/255, value[2]/255];
                    console.log(value);
                    layer.scene.rebuildGeometry();
                    });
        });
        layer_gui.open();
    }

    /***** Render loop *****/
    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {
            resizeMap();
        });
        layer.addTo(map);
    });


}());
