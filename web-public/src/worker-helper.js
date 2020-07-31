// @ts-check

// The main entry point to use webmscore as a web worker,  
// implements the same API set as './index.js'

import { WebMscoreWorker } from '../.cache/worker.js'
import { getSelfURL, shimDom } from './utils.js'

const MSCORE_SCRIPT_URL = getSelfURL()

/**
 * Use webmscore as a web worker
 * @implements {import('./index').default}
 */
class WebMscoreW extends Worker {
    /**
     * @hideconstructor use `WebMscoreW.load`
     */
    constructor() {
        const url = URL.createObjectURL(
            new Blob([
                `(function () { var MSCORE_SCRIPT_URL = "${MSCORE_SCRIPT_URL}";`  // set the environment variable for worker
                + '(' + shimDom.toString() + ')();'
                // %INJECTION_HINT_1%
                + '(' + WebMscoreWorker.toString() + ')()'
                + '})()'
            ])
        )
        super(url)
    }

    /**
     * @returns {Promise<void>}
     */
    static get ready() {
        // not implemented
        return Promise.resolve()
    }

    /**
     * The maximum MSCZ/MSCX file format version supported by webmscore 
     */
    static async version() {
        // not implemented
        return -1
    }

    /**
     * Load the score (MSCZ/MSCX file) data 
     * @param {'mscz' | 'mscx'} format 
     * @param {Uint8Array} data 
     * @param {Uint8Array[]} fonts load extra font files (CJK characters support)
     * @param {boolean} doLayout set to false if you only need the score metadata or the midi file (Super Fast, 3x faster than the musescore software)
     */
    static async load(format, data, fonts = [], doLayout = true) {
        const instance = new WebMscoreW()
        await instance.rpc('ready')
        await instance.rpc('load', [format, data, fonts, doLayout], [data.buffer, /** ...fonts.map(f => f.buffer) */])
        return instance
    }

    /**
     * Communicate with the worker thread with JSON-RPC
     * @private
     * @typedef {{ id: number; result?: any; error?: any; }} RPCRes
     * @param {keyof import('./index').default | '_synthAudio' | 'processSynth' | 'load' | 'ready'} method 
     * @param {any[]} params 
     * @param {Transferable[]} transfer
     */
    async rpc(method, params = [], transfer = undefined) {
        const id = Math.random()

        return new Promise((resolve, reject) => {
            const listener = (e) => {
                /** @type {RPCRes} */
                const data = e.data
                if (data.id === id) {
                    if (data.error) { reject(data.error) }
                    this.removeEventListener('message', listener)
                    resolve(data.result)
                }
            }

            this.addEventListener('message', listener)

            this.postMessage({
                id,
                method,
                params,
            }, transfer)
        })
    }

    /**
     * Only save this excerpt (linked parts) of the score  
     * 
     * if no excerpts, generate excerpts from existing instrument parts
     * 
     * @param {number} id  `-1` means the full score 
     */
    async setExcerptId(id) {
        return this.rpc('setExcerptId', [id])
    }

    async getExcerptId() {
        return this.rpc('getExcerptId')
    }

    /**
     * Generate excerpts from Parts (only parts that are visible) if no existing excerpts
     * @returns {Promise<void>}
     */
    generateExcerpts() {
        return this.rpc('generateExcerpts')
    }

    /**
     * Get the score title
     * @returns {Promise<string>}
     */
    title() {
        return this.rpc('title')
    }

    /**
     * Get the score title (filename safe, replaced some characters)
     * @returns {Promise<string>}
     */
    titleFilenameSafe() {
        return this.rpc('titleFilenameSafe')
    }

    /**
     * Get the number of pages in the score (or the excerpt if `excerptId` is set)
     * @returns {Promise<number>}
     */
    npages() {
        return this.rpc('npages')
    }

    /**
     * Get score metadata
     * @returns {Promise<import('../schemas').ScoreMetadata>}
     */
    metadata() {
        return this.rpc('metadata')
    }

    /**
     * Get the positions of measures
     * @returns {Promise<import('../schemas').Positions>}
     */
    measurePositions() {
        return this.rpc('measurePositions')
    }

    /**
     * Get the positions of segments
     * @returns {Promise<import('../schemas').Positions>}
     */
    segmentPositions() {
        return this.rpc('segmentPositions')
    }

    /**
     * Export score as MusicXML file
     * @returns {Promise<string>} contents of the MusicXML file (plain text)
     */
    saveXml() {
        return this.rpc('saveXml')
    }

    /**
     * Export score as compressed MusicXML file
     * @returns {Promise<Uint8Array>}
     */
    saveMxl() {
        return this.rpc('saveMxl')
    }

    /**
     * Save part score as MSCZ/MSCX file
     * @param {'mscz' | 'mscx'} format 
     * @returns {Promise<Uint8Array>}
     */
    async saveMsc(format = 'mscz') {
        return this.rpc('saveMsc', [format])
    }

    /**
     * Export score as the SVG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground 
     * @returns {Promise<string>} contents of the SVG file (plain text)
     */
    saveSvg(pageNumber = 0, drawPageBackground = false) {
        return this.rpc('saveSvg', [pageNumber, drawPageBackground])
    }

    /**
     * Export score as the PNG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground 
     * @param {boolean} transparent
     * @returns {Promise<Uint8Array>}
     */
    async savePng(pageNumber = 0, drawPageBackground = false, transparent = true) {
        return this.rpc('savePng', [pageNumber, drawPageBackground, transparent])
    }

    /**
     * Export score as PDF file
     * @returns {Promise<Uint8Array>}
     */
    savePdf() {
        return this.rpc('savePdf')
    }

    /**
     * Export score as MIDI file
     * @param {boolean} midiExpandRepeats 
     * @param {boolean} exportRPNs 
     * @returns {Promise<Uint8Array>}
     */
    saveMidi(midiExpandRepeats = true, exportRPNs = true) {
        return this.rpc('saveMidi', [midiExpandRepeats, exportRPNs])
    }

    /**
     * Set the soundfont (sf2/sf3) data
     * @param {Uint8Array} data 
     */
    async setSoundFont(data) {
        await this.rpc('setSoundFont', [data])
        /** @private */
        this.hasSoundfont = true
    }

    /**
     * Export score as audio file (wav/ogg/flac)
     * @param {'wav' | 'ogg' | 'flac'} format 
     * @returns {Promise<Uint8Array>}
     */
    saveAudio(format) {
        if (!this.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }
        return this.rpc('saveAudio', [format])
    }

    /**
     * Export positions of measures or segments (if `ofSegments` == true) as JSON string
     * @param {boolean} ofSegments
     * @also `score.measurePositions()` and `score.segmentPositions()`
     * @returns {Promise<string>}
     */
    savePositions(ofSegments) {
        return this.rpc('savePositions', [ofSegments])
    }

    /**
     * Synthesize audio frames
     * @param {number} starttime The start time offset in seconds
     * @returns {Promise<(cancel: boolean) => Promise<{ done: boolean; playtime: number; chunk: Uint8Array; }>>} The iterator function
     */
    async synthAudio(starttime = 0) {
        const fn = await this.rpc('_synthAudio', [starttime])
        return (cancel) => {
            return this.rpc('processSynth', [fn, cancel])
        }
    }

    /**
     * Export score metadata as JSON string
     * @also `score.metadata()`
     * @returns {Promise<string>} contents of the JSON file
     */
    saveMetadata() {
        return this.rpc('saveMetadata')
    }

    /**
     * @param {boolean=} soft (default `true`)
     *                 * `true`  destroy the score instance only, or
     *                 * `false` destroy the whole WebMscore webworker context 
     * @returns {void}
     */
    destroy(soft = true) {
        if (soft) {
            // destroy the score instance only
            this.rpc('destroy', [soft])
        } else {
            // destroy the whole WebMscore webworker context
            // the default behaviour prior to v0.9.0
            this.terminate()
        }
    }
}

export default WebMscoreW