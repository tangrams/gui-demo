/*jslint browser: true*/
/*global Tangram, gui */

(function () {
    'use strict';

    function appendProtocol(url) {
        return window.location.protocol + url;
    }

    // default source, can be overriden by URL
    var default_tile_source = 'mapzen',
        rS;

    var tile_sources = {
        'mapzen': {
            source: {
                type: 'GeoJSONTileSource',
                url:  'http://vector.mapzen.com/osm/all/{z}/{x}/{y}.json'
            },
            layers: 'layers.yaml',
            styles: 'styles.yaml'
        }
    };

    var locations = {
        'London': [51.508, -0.105, 15],
        'New York': [40.70531887544228, -74.00976419448853, 16],
        'Seattle': [47.609722, -122.333056, 15]
    };
    var osm_debug = false;

    /***** GUI/debug controls *****/

    /*** URL parsing ***/

    // URL hash pattern is one of:
    // #[source]
    // #[lat],[lng],[zoom]
    // #[source],[lat],[lng],[zoom]
    // #[source],[location name]
    var url_hash = window.location.hash.slice(1, window.location.hash.length).split(',');

    // Get tile source from URL
    if (url_hash.length >= 1 && tile_sources[url_hash[0]] != null) {
        default_tile_source = url_hash[0];
    }

    // Get location from URL
    var map_start_location = locations['New York'];

    if (url_hash.length == 3) {
        map_start_location = url_hash.slice(0, 3);
    }
    if (url_hash.length > 3) {
        map_start_location = url_hash.slice(1, 4);
    }
    else if (url_hash.length == 2) {
        map_start_location = locations[url_hash[1]];
    }

    if (url_hash.length > 4) {
        var url_ui = url_hash.slice(4);

        // Mode on URL?
        var url_mode;
        if (url_ui) {
            var re = new RegExp(/mode=(\w+)/);
            url_ui.forEach(function(u) {
                var match = u.match(re);
                url_mode = (match && match.length > 1 && match[1]);
            });
        }
    }

    // Put current state on URL
    function updateURL() {
        var map_latlng = map.getCenter(),
            url_options = [default_tile_source, map_latlng.lat, map_latlng.lng, map.getZoom()];

        if (rS) {
            url_options.push('rstats');
        }

        window.location.hash = url_options.join(',');
    }

    /*** Map ***/

    var map = L.map('map', {
        maxZoom: 20,
        minZoom: 1,
        inertia: false,
        keyboard: true
    });

    var layer = Tangram.leafletLayer({
        vectorTileSource: tile_sources[default_tile_source].source,
        vectorLayers: tile_sources[default_tile_source].layers,
        vectorStyles: tile_sources[default_tile_source].styles,
        numWorkers: 2,
        preRender: preRender,
        postRender: postRender,
        attribution: 'Map data &copy; OpenStreetMap contributors | <a href="https://github.com/tangrams/tangram" target="_blank">Source Code</a>',
        unloadInvisibleTiles: false,
        updateWhenIdle: false
    });
    window.layer = layer;

    var scene = layer.scene;
    window.scene = scene;

    // Update URL hash on move
    map.attributionControl.setPrefix('');
    map.setView(map_start_location.slice(0, 2), map_start_location[2]);
    map.on('moveend', updateURL);

    // Resize map to window
    function resizeMap() {
        document.getElementById('map').style.width = window.innerWidth + 'px';
        document.getElementById('map').style.height = window.innerHeight + 'px';
        map.invalidateSize(false);
    }

    window.addEventListener('resize', resizeMap);
    resizeMap();

    // Render/GL stats: http://spite.github.io/rstats/
    // Activate with 'rstats' anywhere in options list in URL
    if (url_ui && url_ui.indexOf('rstats') >= 0) {
        var glS = new glStats();
        glS.fractions = []; // turn this off till we need it

        rS = new rStats({
            values: {
                frame: { caption: 'Total frame time (ms)', over: 5 },
                raf: { caption: 'Time since last rAF (ms)' },
                fps: { caption: 'Framerate (FPS)', below: 30 },
                rendertiles: { caption: 'Rendered tiles' },
                features: { caption: '# of geo features' },
                glbuffers: { caption: 'GL buffers (MB)' }
            },
            CSSPath : 'demos/lib/',
            plugins: [glS]
        });

        // Move it to the bottom-left so it doesn't obscure zoom controls
        var rSDOM = document.querySelector('.rs-base');
        rSDOM.style.bottom = '0px';
        rSDOM.style.top = 'inherit';
    }

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

        // Feature selection on hover
        gui['feature info'] = true;
        gui.add(gui, 'feature info');

        // Layers
        var layer_gui = gui.addFolder('Layers');
        var layer_controls = {};
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
        });

    }


    // Feature selection
    function initFeatureSelection () {
        // Selection info shown on hover
        var selection_info = document.createElement('div');
        selection_info.setAttribute('class', 'label');
        selection_info.style.display = 'block';

        // Show selected feature on hover
        scene.container.addEventListener('mousemove', function (event) {

            var pixel = { x: event.clientX, y: event.clientY };

            scene.getFeatureAt(
                pixel,
                function (selection) {
                    var feature = selection.feature;
                    if (feature != null) {
                        // console.log("selection map: " + JSON.stringify(feature));

                        var label = '';
                        if (feature.properties.name != null) {
                            label = feature.properties.name;
                        }

                        if (label != '') {
                            selection_info.style.left = (pixel.x + 5) + 'px';
                            selection_info.style.top = (pixel.y + 15) + 'px';
                            selection_info.innerHTML = '<span class="labelInner">' + label + '</span>';
                            scene.container.appendChild(selection_info);
                        }
                        else if (selection_info.parentNode != null) {
                            selection_info.parentNode.removeChild(selection_info);
                        }
                    }
                    else if (selection_info.parentNode != null) {
                        selection_info.parentNode.removeChild(selection_info);
                    }
                }
            );

            // Don't show labels while panning
            if (scene.panning == true) {
                if (selection_info.parentNode != null) {
                    selection_info.parentNode.removeChild(selection_info);
                }
            }
        });
    }

    // Pre-render hook
    function preRender () {
        if (rS != null) { // rstats
            rS('frame').start();
            // rS('raf').tick();
            rS('fps').frame();

            if (scene.dirty) {
                glS.start();
            }
        }
    }

    // Post-render hook
    function postRender () {
        if (rS != null) { // rstats
            rS('frame').end();
            rS('rendertiles').set(scene.renderable_tiles_count);
            rS('glbuffers').set((scene.getDebugSum('buffer_size') / (1024*1024)).toFixed(2));
            rS('features').set(scene.getDebugSum('features'));
            rS().update();
        }
    }

    /***** Render loop *****/
    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {    
            updateURL();
            addGUI();        
            initFeatureSelection();
        });
        layer.addTo(map);

        if (osm_debug == true) {
            window.osm_layer =
                L.tileLayer(
                    'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    { opacity: 0.5 })
                .bringToFront()
                .addTo(map);
        }
    });


}());
