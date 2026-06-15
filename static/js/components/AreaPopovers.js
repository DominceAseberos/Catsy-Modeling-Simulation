// static/js/components/AreaPopovers.js
import { configState } from '../core/ConfigState.js';
import { simulationClient } from '../core/SimulationClient.js';

export class AreaPopovers {
    constructor() {
        this.bindPopovers();
        this.bindInlineControls();
    }

    bindPopovers() {
        // Handle popover toggling
        const gears = document.querySelectorAll('.btn-gear');
        gears.forEach(gear => {
            gear.addEventListener('click', (e) => {
                e.stopPropagation();
                const popId = gear.getAttribute('data-popover');
                if (!popId) return;
                
                const pop = document.getElementById(popId);
                const isVisible = pop.style.display === 'block';
                
                // Close all others
                document.querySelectorAll('.local-popover').forEach(p => p.style.display = 'none');
                
                if (!isVisible) {
                    pop.style.display = 'block';
                    fetch('/api/pause', { method: 'POST' }).catch(e => console.error(e));
                    simulationClient.pause();
                } else {
                    fetch('/api/resume', { method: 'POST' }).catch(e => console.error(e));
                    simulationClient.resume();
                }
            });
        });

        // Close popovers when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.local-popover') && !e.target.closest('.btn-gear')) {
                let closedAny = false;
                document.querySelectorAll('.local-popover').forEach(p => {
                    if (p.style.display === 'block') {
                        p.style.display = 'none';
                        closedAny = true;
                    }
                });
                if (closedAny) {
                    fetch('/api/resume', { method: 'POST' }).catch(e => console.error(e));
                    simulationClient.resume();
                }
            }
        });
    }

    bindInlineControls() {
        // Expose updateConfigVal to window so legacy onclicks still work 
        // while routing data flow through ConfigState.
        window.updateConfigVal = (id, delta, min, max) => {
            const input = document.getElementById(id);
            if (!input) return;
            
            let val = parseInt(input.value) || min;
            val += delta;
            if (val < min) val = min;
            if (val > max) val = max;
            input.value = val;
            
            const disp = document.getElementById(id.replace('cfg-', 'disp-'));
            if (disp) {
                disp.innerText = val;
            }
            
            // Trigger state update
            configState.refreshFromDOM();
            
            // Dispatch UI event for renderer (legacy support)
            const event = new CustomEvent('ui_config_update', { detail: { id, val } });
            window.dispatchEvent(event);
        };
    }
}
