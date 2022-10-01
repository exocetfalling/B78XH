import {HeavyDataStorage} from "../../utils/HeavyDataStorage";

export class SimBriefCredentials {

	/**
	 * SimBrief username
	 * @type {string}
	 * @private
	 */
	private readonly _userName: string;
	/**
	 * SimBrief userId
	 * @type {number}
	 * @private
	 */
	private readonly _userId: number;

	/**
	 * Constructor
	 * @param {string} userName
	 * @param {number} userId
	 */
	constructor(userName: string = '', userId: number = NaN) {
		this._userName = userName;
		this._userId = userId;
	}

	/**
	 * Returns SimBrief username
	 * @returns {string}
	 */
	public get userName(): string {
		if (this._userName) {
			return this._userName;
		} else {
			const userName = HeavyDataStorage.get('SIMBRIEF_USERNAME', '');
			if (userName) {
				return String(userName);
			} else {
				return '';
			}
		}
	}

	/**
	 * Returns SimBrief userId
	 * @returns {number}
	 */
	public get userId(): number {
		return this._userId || Number(HeavyDataStorage.get('SIMBRIEF_USERID', ''));
	}
}