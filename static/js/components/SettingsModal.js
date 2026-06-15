// static/js/components/SettingsModal.js
import { configState } from '../core/ConfigState.js';
import { simulationClient } from '../core/SimulationClient.js';

export class SettingsModal {
    constructor() {
        this.btnSettings = document.getElementById('btn-settings');
        this.btnCloseSettings = document.getElementById('btn-close-settings');
        this.settingsScrim = document.getElementById('settings-scrim');
        this.scenarioSelect = document.getElementById('cfg-scenario');
        this.arrivalInput = document.getElementById('cfg-arrival');
        
        this.bindEvents();
    }

    bindEvents() {
        // Open Modal
        if (this.btnSettings && this.settingsScrim) {
            this.btnSettings.addEventListener('click', () => {
                this.settingsScrim.classList.add('scrim--active');
                simulationClient.pause();
            });
        }

        // Close Modal
        if (this.btnCloseSettings && this.settingsScrim) {
            this.btnCloseSettings.addEventListener('click', () => {
                this.settingsScrim.classList.remove('scrim--active');
                simulationClient.resume();
                // Persist/Update config state when modal closes
                configState.refreshFromDOM();
            });
        }

        // Scenario Preset Logic
        if (this.scenarioSelect && this.arrivalInput) {
            this.scenarioSelect.addEventListener('change', (e) => {
                if (e.target.value !== 'custom') {
                    this.arrivalInput.value = e.target.value;
                    configState.refreshFromDOM();
                }
            });

            this.arrivalInput.addEventListener('input', () => {
                let match = false;
                for (let option of this.scenarioSelect.options) {
                    if (option.value === this.arrivalInput.value && option.value !== 'custom') {
                        this.scenarioSelect.value = option.value;
                        match = true;
                        break;
                    }
                }
                if (!match) {
                    this.scenarioSelect.value = 'custom';
                }
            });
            
            this.arrivalInput.addEventListener('change', () => {
                configState.refreshFromDOM();
            });
        }

        // Bind global update function to Window for inline onchange attributes 
        // (to handle inputs dynamically updating config before we strip inline HTML handlers completely)
        window.triggerConfigUpdate = () => {
            configState.refreshFromDOM();
        };
    }
}
