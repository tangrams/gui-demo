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
    var rS;

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
        preUpdate: preUpdate,
        postUpdate: postUpdate,
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

        // Layers
        var layer_gui = gui.addFolder('Layers');
        var layer_controls = {};
        var layer_colors = {};
        Object.keys(layer.scene.config.layers).forEach(function(l) {
            if (layer.scene.config.layers[l] == null) {
                return;
            }
            layer_controls[l] = !(layer.scene.config.layers[l].style.visible == false);
            layer_gui.
                add(layer_controls, l).
                onChange(function(value) {
                    layer.scene.config.layers[l].style.visible = value;
                    layer.scene.rebuildGeometry();
                });
            var c = layer.scene.config.layers[l].style.color;
            layer_colors[l] = [c[0]*255, c[1]*255, c[2]*255];
            layer_gui.
                addColor(layer_colors, l).
                onChange(function(value) {
                    layer.scene.config.layers[l].style.color = [value[0]/255, value[1]/255, value[2]/255];
                    layer.scene.rebuildGeometry();
                    });
        });
        layer_gui.open();
    }

    // Render/GL stats: http://spite.github.io/rstats/
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
        CSSPath : 'lib/',
        plugins: [glS]
    });

    // Move it to the bottom-left so it doesn't obscure zoom controls
    var rSDOM = document.querySelector('.rs-base');
    rSDOM.style.bottom = '0px';
    rSDOM.style.top = 'inherit';

    // Pre-render hook
    function preUpdate (will_render) {
        // Profiling
        if (will_render && rS) {
            rS('frame').start();
            // rS('raf').tick();
            rS('fps').frame();

            if (scene.dirty) {
                glS.start();
            }
        }
    }

    // Post-render hook
    function postUpdate () {
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
            addGUI();
            resizeMap();
        });
        layer.addTo(map);
    });

}());
