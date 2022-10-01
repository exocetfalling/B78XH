// prototype singleton, this needs to be different ofc
import {B787_10_FMC_RouteRequestPage} from './B787_10_FMC_RouteRequestPage';
import {B787_10_FMC} from './B787_10_FMC';
import {B787_10_FMC_PerfInitPage} from './B787_10_FMC_PerfInitPage';
import {BaseFMC} from './BaseFMC';
import * as HDSDK from './../../hdsdk/index';
import {HDLogger} from '../../hdlogger';
import {Level} from '../../hdlogger/levels/level';

let RoutePageInstance = undefined;

export class B787_10_FMC_RoutePage {
	private _fmc: B787_10_FMC;
	private _isDirty: boolean;
	private _currentPage: number;
	private _pageCount: number;
	private _offset: number;
	private _fplnVersion: number;
	private _activeWptIndex: number;
	private _lsk6Field: string;
	private _activateCell: string;
	private _modStr: string;
	private _originCell: string;
	private _destinationCell: string;
	private _distanceCell: string;
	private _flightNoCell: string;
	private _coRouteCell: string;
	private _airwayInput: string;
	private _airwayIndex: number;
	private _rows: any[];
	private _depRwyCell: string;

	constructor(fmc: B787_10_FMC) {
		this._fmc = fmc;
		this._isDirty = true;

		this._currentPage = 0;
		this._pageCount = 2;
		this._offset = 0;
		this._fplnVersion = -1;
		this._activeWptIndex = -1;

		this._lsk6Field = '';
		this._activateCell = '';
		this._originCell;
		this._destinationCell;
		this._distanceCell;
		this._flightNoCell;
		this._coRouteCell;
		this._airwayInput = '';

		this._rows = [];
	}

	set currentPage(value) {
		this._currentPage = value;
		if (this._currentPage > (this._pageCount - 1)) {
			this._currentPage = 0;
		} else if (this._currentPage < 0) {
			this._currentPage = (this._pageCount - 1);
		}

		if (this._currentPage == 0) {
			this._offset = 0;
		} else {
			this._offset = ((this._currentPage - 1) * 5) + 1;
		}
	}

	gotoNextPage() {
		this.currentPage = this._currentPage + 1;
		this.update(true);
	}

	gotoPrevPage() {
		this.currentPage = this._currentPage - 1;
		this.update(true);
	}

	update(forceUpdate = false) {
		// check if active wpt changed
		const actWptIndex = this._fmc.flightPlanManager.getActiveWaypointIndex();
		if (this._activeWptIndex != actWptIndex) {
			this._activeWptIndex = actWptIndex;
			this._isDirty = true;
		}

		if (this._isDirty || forceUpdate) {
			this.invalidate();
		}

		// register refresh and bind to update which will only render on changes
		this._fmc.registerPeriodicPageRefresh(() => {
			this.update();
			return true;
		}, 1000, false);
	}

	invalidate() {
		this._isDirty = true;
		this._fmc.cleanUpPage();
		this.prerender();
		this.render();
		this.bindEvents();
		this._isDirty = false;
	}


	prerender() {
		const currentFp = this._fmc.flightPlanManager.getCurrentFlightPlan();

		if (this._currentPage == 0) {
			this._originCell = '□□□□';
			if (currentFp.hasOrigin) {
				this._originCell = this._fmc.flightPlanManager.getOrigin().ident;
			}

			this._originCell = this._fmc.makeSettable(this._originCell);

			this._destinationCell = '□□□□';
			if (currentFp.hasDestination) {
				this._destinationCell = this._fmc.flightPlanManager.getDestination().ident;
			}

			this._destinationCell = this._fmc.makeSettable(this._destinationCell);

			this._distanceCell = '----';
			if (currentFp.hasDestination && currentFp.hasOrigin) {
				this._distanceCell = Avionics.Utils.computeGreatCircleDistance(this._fmc.flightPlanManager.getOrigin().infos.coordinates, this._fmc.flightPlanManager.getDestination().infos.coordinates).toFixed(0);
			}

			this._flightNoCell = '--------';
			const flightNoValue = SimVar.GetSimVarValue('ATC FLIGHT NUMBER', 'string');
			if (flightNoValue) {
				this._flightNoCell = flightNoValue;
			}

			this._flightNoCell = this._fmc.makeSettable(this._flightNoCell);
			this._depRwyCell = '-----';
			const selectedDepRunway = this._fmc.flightPlanManager.getDepartureRunway();
			if (selectedDepRunway) {
				this._depRwyCell = 'RW' + selectedDepRunway.designation;
			}
			this._depRwyCell = this._fmc.makeSettable(this._depRwyCell);

			this._coRouteCell = '--------';
			if (this._fmc.coRoute) {
				this._coRouteCell = this._fmc.coRoute;
			}
			this._coRouteCell = this._fmc.makeSettable(this._coRouteCell);
		}

		if (this._fmc.flightPlanManager.getCurrentFlightPlanIndex() === 1) {
			if (!this._fmc._isMainRouteActivated) {
				this._fmc.fpHasChanged = true;
				this._lsk6Field = '<ERASE';
				this._activateCell = 'ACTIVATE>';
			} else {
				this._fmc.fpHasChanged = true;
				this._activateCell = 'PERF INIT>';
				this._lsk6Field = '<ERASE';
			}
		} else if (this._fmc.flightPlanManager.getCurrentFlightPlanIndex() === 0) {
			this._fmc.fpHasChanged = false;
			this._activateCell = 'PERF INIT>';
			this._lsk6Field = '<RTE 2';
		}

		const currFplnVer = SimVar.GetSimVarValue(FlightPlanManager.FlightPlanVersionKey, 'number');
		if (this._fmc.fpHasChanged === true || this._fplnVersion < currFplnVer) {
			this._rows = B787_10_FMC_RoutePage._GetAllRows(this._fmc);
			this._fplnVersion = currFplnVer;
			// fill in empty row
			const emptyRow = new FpRow();
			const prevRow = this._rows[this._rows.length - 1];
			if (prevRow !== undefined) {
				if (this._airwayInput !== '') {
					emptyRow.airwayIn = this._airwayInput;
					emptyRow.fpIdx = this._airwayIndex;
					const idx = this._rows.findIndex(x => x.fpIdx === this._airwayIndex) + 1;
					this._rows.splice(idx, 0, emptyRow);
				} else {
					emptyRow.fpIdx = (prevRow.fpIdx + 2);
					this._rows.push(emptyRow);
				}
			} else {
				let emptyFixIndex = 1;
				const firstFix = this._fmc.flightPlanManager.getWaypoint(emptyFixIndex);
				if (firstFix && firstFix.isRunway) {
					emptyFixIndex++;
				}

				emptyRow.fpIdx = emptyFixIndex;
				this._rows.push(emptyRow);
			}
		}

		this._pageCount = Math.max(2, (Math.ceil((this._rows.length) / 5) + 1));

		this._modStr = this._fmc.fpHasChanged ? 'MOD' : 'ACT';
	}

	render() {
		if (this._currentPage == 0) {
			this.renderMainPage();
		} else {
			this.renderRoutePage();
		}
	}

	renderMainPage() {
		this._fmc._renderer.renderTitle('RTE 1');
		this._fmc._renderer.renderPages(1, this._pageCount);

		this._fmc._renderer.render([
			['ORIGIN', 'DEST'],
			[this._originCell, this._destinationCell],
			['RUNWAY', 'FLT NO'],
			[this._depRwyCell, this._flightNoCell],
			['ROUTE', 'CO ROUTE'],
			['<REQUEST', this._coRouteCell],
			['ROUTE'],
			['<REPORT', 'RTE COPY>'],
			['', 'ROUTE ---------------------------------------', ''],
			['<PRINT', 'ALTN>'],
			[''],
			[this._lsk6Field, this._activateCell]
		]);
	}

	renderRoutePage() {
		const idx = this._offset - 1;

		this._fmc._renderer.renderTitle(this._modStr + ' RTE 1');
		this._fmc._renderer.renderPages(this._currentPage + 1, this._pageCount);

		this._fmc._renderer.render([
			['VIA', 'TO'],
			this._rows[idx] ? this._rows[idx].getTemplate(this._fmc)[0] : [''],
			this._rows[idx] ? this._rows[idx].getTemplate(this._fmc)[1] : [''],
			this._rows[idx + 1] ? this._rows[idx + 1].getTemplate(this._fmc)[0] : [''],
			this._rows[idx + 1] ? this._rows[idx + 1].getTemplate(this._fmc)[1] : [''],
			this._rows[idx + 2] ? this._rows[idx + 2].getTemplate(this._fmc)[0] : [''],
			this._rows[idx + 2] ? this._rows[idx + 2].getTemplate(this._fmc)[1] : [''],
			this._rows[idx + 3] ? this._rows[idx + 3].getTemplate(this._fmc)[0] : [''],
			this._rows[idx + 3] ? this._rows[idx + 3].getTemplate(this._fmc)[1] : [''],
			this._rows[idx + 4] ? this._rows[idx + 4].getTemplate(this._fmc)[0] : [''],
			['__FMCSEPARATOR'],
			[this._lsk6Field, this._activateCell]
		]);
	}

	bindEvents() {
		if (this._currentPage == 0) {
			// main page
			this._fmc._renderer.lsk(1).event = () => {
				const value = this._fmc.inOut;
				if (value == '') {
					if (this._fmc.flightPlanManager.getOrigin()) {
						this._fmc.inOut = this._fmc.flightPlanManager.getOrigin().ident;
					}
				} else {
					if (Simplane.getIsGrounded()) {
						if (this._fmc.currentFlightPhase <= FlightPhase.FLIGHT_PHASE_CLIMB) {
							this._fmc.clearUserInput();
							this.setOrigin(value.padEnd(4));
						} else {
							this._fmc.clearUserInput();
							/*
							 this._fmc.prepareForTurnAround(() => {
							 this.setOrigin(value.padEnd(4));
							 });
							 */
						}
					}
				}
			};

			this._fmc._renderer.rsk(1).event = () => {
				const value = this._fmc.inOut;
				if (value == '') {
					if (this._fmc.flightPlanManager.getDestination()) {
						this._fmc.inOut = this._fmc.flightPlanManager.getDestination().ident;
					}
				} else {
					this._fmc.clearUserInput();
					this.setDestination(value.padEnd(4));
				}
			};

			if (this._fmc.flightPlanManager.getOrigin()) {
				this._fmc._renderer.lsk(2).event = () => {
					let value = this._fmc.inOut;
					this._fmc.clearUserInput();
					this._fmc.setOriginRunway(value, (result) => {
						if (result) {
							this.update(true);
						}
					});
				};
			}

			this._fmc._renderer.rsk(2).event = () => {
				const value = this._fmc.inOut;
				this._fmc.clearUserInput();
				this._fmc.updateFlightNo(value, (result) => {
					if (result) {
						this.update(true);
					}
				});
			};

			if (HDSDK.HeavyDataStorage.get('SIMBRIEF_USERNAME') || HDSDK.HeavyDataStorage.get('SIMBRIEF_USERID')) {
				this._fmc._renderer.lsk(3).event = () => {
					new B787_10_FMC_RouteRequestPage(this._fmc).showPage();
				};
			}

		} else {
			// other pages
			for (let i = 0; i < 5; i++) {
				if (this._rows[i + this._offset - 1]) {
					this.bindRowEvents(i);
				}
			}
		}

		// paging
		this._fmc.onPrevPage = () => {
			this.gotoPrevPage();
		};
		this._fmc.onNextPage = () => {
			this.gotoNextPage();
		};

		// exec stuff
		this._fmc._renderer.lsk(6).event = () => {
			if (this._lsk6Field === '<ERASE') {
				if (this._fmc.flightPlanManager.getCurrentFlightPlanIndex() === 1) {
					this._airwayInput = '';
					this._airwayIndex = -1;
					this._fmc.fpHasChanged = false;
					this._fmc.eraseTemporaryFlightPlan(() => {
						this._fmc.eraseRouteModifications();
						/**
						 * TODO: Check for better approach
						 */
						this._fmc.flightPlanManager._updateFlightPlanVersion();
						this.update(true);
					});
				}
			}
		};

		this._fmc._renderer.rsk(6).event = () => {
			if (this._activateCell === 'PERF INIT>') {
				B787_10_FMC_PerfInitPage.ShowPage1(this._fmc);
			} else if (this._activateCell === 'ACTIVATE>') {
				this._fmc.activateMainRoute();
				this.update(true);
			}
		};

		this._fmc.onExecPage = () => {
			if (this._fmc.flightPlanManager.getCurrentFlightPlanIndex() === 1) {
				this._airwayInput = '';
				this._airwayIndex = -1;
				if (!this._fmc.getIsRouteActivated()) {
					this._fmc.activateRoute();
				}
				this._fmc.refreshPageCallback = () => this.update(true); // TODO see why this would be needed
				this._fmc.onExecDefault();
			} else {
				this._fmc._isRouteActivated = false;
				this._fmc.fpHasChanged = false;
				this._fmc._activatingDirectTo = false;
			}
		};
	}

	/**
	 * Bind the LSK events to a plan row.
	 * @param {Number} lskIdx
	 */
	bindRowEvents(lskIdx) {
		if (this._currentPage > 0) {
			this._fmc._renderer.lsk(lskIdx + 1).event = () => {
				const value = this._fmc.inOut;
				this._fmc.clearUserInput();
				this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
					const idx = lskIdx;
					//const lastWpIdx = this._rows[idx + this._offset - 1].fpIdx;
					/**
					 * Hotfix
					 */
					const lastWpIdx = this._rows[idx + this._offset - 2].fpIdx;
					const lastWaypoint = this._fmc.flightPlanManager.getWaypoints()[lastWpIdx];
					if (lastWaypoint.infos instanceof WayPointInfo) {
						lastWaypoint.infos.UpdateAirway(value).then(() => {
							const airway = lastWaypoint.infos.airways.find(a => {
								return a.name === value;
							});
							if (airway) {
								this._airwayInput = airway.name;
								this._airwayIndex = lastWpIdx;
								this.update(true);
							} else {
								this._fmc.showErrorMessage('NO AIRWAY MATCH');
							}
						});
					}
				});
			};
		}

		this._fmc._renderer.rsk(lskIdx + 1).event = () => {
			const value = this._fmc.inOut;
			const idx = (this._currentPage > 0) ? lskIdx - 1 : 0;
			const row = this._rows[idx + this._offset];
			const wpIdx = row.fpIdx;

			if (value === BaseFMC.clrValue) {
				this._fmc.clearUserInput();
				if (row.isDeparture) {
					this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
						this._fmc.removeDeparture();
						this._fmc.activateRoute(false, () => {
							this.update(true);
						});
					});
				} else {
					this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
						const waypoints = this._fmc.flightPlanManager.getWaypoints();
						const current = waypoints[wpIdx];
						const currentIn = current.infos.airwayIn;
						if (currentIn !== undefined) {
							const currentOut = current.infos.airwayOut;
							let numberOfWaypointsToDelete = 0;
							for (let i = wpIdx - 1; i > 0; i--) {
								if (waypoints[i].infos.airwayIn === currentIn || waypoints[i].infos.airwayOut === currentOut) {
									numberOfWaypointsToDelete++;
								} else {
									break;
								}
							}

							const startIndex = wpIdx - numberOfWaypointsToDelete;

							for (let i = 0; i <= numberOfWaypointsToDelete; i++) {
								const last = i === numberOfWaypointsToDelete;
								this._fmc.removeWaypoint(startIndex, () => {
									if (last) {
										this._fmc.activateRoute(false, () => {
											this.update(true);
										});
									}
								});
							}
						} else {
							this._fmc.removeWaypoint(wpIdx, () => {
								this._fmc.activateRoute(false, () => {
									this.update(true);
								});
							});
						}
					});
				}
			} else if (value.length > 0) {
				this._fmc.clearUserInput();
				if (this._airwayInput !== '') {
					this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
						this._fmc.getOrSelectWaypointByIdent(value, (wpt) => {
							if (!wpt) {
								this._fmc.showErrorMessage('NOT IN DATABASE');
							}
							const lastWpIdx = this._rows[idx + this._offset - 1].fpIdx;
							const lastWaypoint = this._fmc.flightPlanManager.getWaypoints()[lastWpIdx];
							lastWaypoint.infos.airwayOut = this._airwayInput;
							B787_10_FMC_RoutePage.insertWaypointsAlongAirway(this._fmc, wpt.ident, lastWpIdx, this._airwayInput, (result) => {
								if (result) {
									this._airwayInput = '';
									this._airwayIndex = -1;
									// console.log("added " + wpt.ident);
									this.update(true);
								} else {
									this._fmc.showErrorMessage('NOT ON AIRWAY');
								}
							});
						});
					});
				} else {
					const pilotWaypoint = this._fmc._pilotWaypoints._pilotWaypointArray.find(w => w.id == value);
					if (pilotWaypoint) {
						const pilotWaypointObject = CJ4_FMC_PilotWaypointParser.buildPilotWaypointFromExisting(pilotWaypoint.id, parseFloat(pilotWaypoint.la), parseFloat(pilotWaypoint.lo), this._fmc);
						this._fmc.ensureCurrentFlightPlanIsTemporary(() => {
							this._fmc.flightPlanManager.addUserWaypoint(pilotWaypointObject, wpIdx, () => {
								this._fmc.activateRoute(false, () => {
									this.update(true);
								});
							});
						});
					} else {
						this._fmc.insertWaypoint(value, wpIdx, (isSuccess) => {
							if (isSuccess) {
								this.update(true);
							}
						});
					}
				}
			} else {

			}
		};
	}

	setDestination(icao) {
		this._fmc.updateRouteDestination(icao, (result) => {
			if (result) {
				this._fmc.flightPlanManager.setApproachTransitionIndex(-1, () => {
					this._fmc.flightPlanManager.setArrivalProcIndex(-1, () => {
						this._fmc.flightPlanManager.setApproachIndex(-1, () => {
							this._fmc.fpHasChanged = true;
							this.update(true);
						});
					});
				});
			}
		});
	}

	setOrigin(icao) {
		if (!SimVar.GetSimVarValue('SIM ON GROUND', 'boolean')) {
			this._fmc.showErrorMessage('NOT ON GROUND');
			return;
		}

		this._fmc.tmpDestination = undefined;
		this._fmc.flightPlanManager.createNewFlightPlan(() => {
			this._fmc.updateRouteOrigin(icao, (result) => {
				if (result) {
					this._fmc.fpHasChanged = true;
					SimVar.SetSimVarValue('L:WT_CJ4_INHIBIT_SEQUENCE', 'number', 0);
					//this._fmc.updateVSpeeds();
					this._fmc.updateFuelVars();
					this.update(true);
				}
			});
		});
	}

	static ShowPage1(fmc) {
		fmc.cleanUpPage();
		RoutePageInstance = new B787_10_FMC_RoutePage(fmc);
		RoutePageInstance.update();
	}

	static async insertWaypointsAlongAirway(fmc, lastWaypointIdent, index, airwayName, callback = EmptyCallback.Boolean) {
		const referenceWaypoint = fmc.flightPlanManager.getWaypoint(index);
		if (referenceWaypoint) {
			const infos = referenceWaypoint.infos;
			if (infos instanceof WayPointInfo) {
				const airway = infos.airways.find(a => {
					return a.name === airwayName;
				});
				if (airway) {
					const firstIndex = airway.icaos.indexOf(referenceWaypoint.icao);
					const lastWaypointIcao = airway.icaos.find(icao => icao.substring(7, 12) === lastWaypointIdent.padEnd(5, ' '));
					const lastIndex = airway.icaos.indexOf(lastWaypointIcao);
					if (firstIndex >= 0) {
						if (lastIndex >= 0) {
							let inc = 1;
							if (lastIndex < firstIndex) {
								inc = -1;
							}

							const count = Math.abs(lastIndex - firstIndex);
							for (let i = 1; i < count + 1; i++) { // 9 -> 6
								const syncInsertWaypointByIcao = async (icao, idx): Promise<void> => {
									return new Promise(resolve => {
										//console.log('add icao:' + icao + ' @ ' + idx);
										fmc.flightPlanManager.addWaypoint(icao, idx, () => {
											const waypoint = fmc.flightPlanManager.getWaypoint(idx);
											waypoint.infos.UpdateAirway(airwayName).then(() => {
												waypoint.infos.airwayIn = airwayName;
												if (i < count) {
													waypoint.infos.airwayOut = airwayName;
												}
												//console.log('icao:' + icao + ' added; Airway in: ' + waypoint.infos.airwayIn + '; Airway out: ' + waypoint.infos.airwayOut);
												resolve();
											});
										});
									});
								};

								await syncInsertWaypointByIcao(airway.icaos[firstIndex + i * inc], index + i);
							}
							callback(true);
							return;
						}
						fmc.showErrorMessage('2ND INDEX NOT FOUND');
						return callback(false);
					}
					fmc.showErrorMessage('1ST INDEX NOT FOUND');
					return callback(false);
				}
				fmc.showErrorMessage('NO REF WAYPOINT');
				return callback(false);
			}
			fmc.showErrorMessage('NO WAYPOINT INFOS');
			return callback(false);
		}
		fmc.showErrorMessage('NO REF WAYPOINT');
		return callback(false);
	}

	static _GetAllRows(fmc) {
		const allRows = [];
		const flightPlanManager = fmc.flightPlanManager;
		let lastDepartureWaypoint = undefined;
		let foundActive = false; // haaaaackyyy
		let departure = undefined;
		let departureWaypoints = undefined;
		if (flightPlanManager) {

			/**
			 * Departure
			 */

			departure = flightPlanManager.getDeparture();
			if (departure) {
				departureWaypoints = flightPlanManager.getDepartureWaypointsMap();
				const lastDepartureIdx = departureWaypoints.length - 1;
				lastDepartureWaypoint = departureWaypoints[lastDepartureIdx];
				if (lastDepartureWaypoint) {
					foundActive = flightPlanManager.getActiveWaypointIndex() <= lastDepartureIdx;
					allRows.push(new FpRow(lastDepartureWaypoint.ident, lastDepartureIdx + 1, departure.name, undefined, foundActive, true));
				}
			}

			/**
			 * Enroute
			 */
			const fpIndexes = [];
			const routeWaypoints = flightPlanManager.getEnRouteWaypoints(fpIndexes);
			let tmpFoundActive = false;
			for (let i = 0; i < routeWaypoints.length; i++) {
				let prev = undefined;
				if (i == 0 && lastDepartureWaypoint) {
					prev = lastDepartureWaypoint;
				} else {
					prev = routeWaypoints[i - 1];
				}
				const wp = routeWaypoints[i];
				if (wp) {

					tmpFoundActive = tmpFoundActive || (!foundActive && flightPlanManager.getActiveWaypointIndex() <= fpIndexes[i]);
					if (tmpFoundActive) {
						foundActive = true;
					}

					if (wp.infos.airwayIn !== undefined && prev && prev.infos.airwayOut === wp.infos.airwayIn) {
						// is there a next waypoint?
						const nextWp = routeWaypoints[i + 1];
						if (nextWp) {
							const airwayContinues = (wp.infos.airwayIn === wp.infos.airwayOut && nextWp.infos.airwayIn === wp.infos.airwayOut);
							if (airwayContinues) {
								continue;
							}
						}
						allRows.push(new FpRow(wp.ident, fpIndexes[i], wp.infos.airwayIn, wp.infos.airwayOut, tmpFoundActive));
						tmpFoundActive = false;
					} else {
						allRows.push(new FpRow(wp.ident, fpIndexes[i], undefined, wp.infos.airwayOut, tmpFoundActive));
						tmpFoundActive = false;
					}
				}
			}

			/** @type {ManagedFlightPlan} */
			const fpln = flightPlanManager.getCurrentFlightPlan();

			const arrivalSeg = fpln.getSegment(SegmentType.Arrival);
			if (arrivalSeg !== FlightPlanSegment.Empty) {
				const arrival = flightPlanManager.getArrival();
				const currentWaypointIndex = fpln.activeWaypointIndex;

				if (arrival) {
					const transitionIndex = fpln.procedureDetails.arrivalTransitionIndex;
					const transition = arrival.enRouteTransitions[transitionIndex];
					const arrivalName = transitionIndex !== -1 && transition
						? `${transition.name}.${arrival.name}`
						: `${arrival.name}`;

					const finalFix = arrivalSeg.waypoints[arrivalSeg.waypoints.length - 1];
					const isSegmentActive = currentWaypointIndex >= arrivalSeg.offset && currentWaypointIndex < arrivalSeg.offset + arrivalSeg.waypoints.length;

					allRows.push(new FpRow((finalFix ? finalFix.ident : ''), arrivalSeg.offset, arrivalName, undefined, isSegmentActive));
				}
			}

			/** @type {FlightPlanSegment} */
			const approachSeg = fpln.getSegment(SegmentType.Approach);
			if (approachSeg !== FlightPlanSegment.Empty) {
				// first app fix
				const fWp = approachSeg.waypoints[0];
				const fFpIdx = approachSeg.offset;
				let tmpFoundActive = !foundActive && flightPlanManager.getActiveWaypointIndex() <= fFpIdx;
				if (tmpFoundActive) {
					foundActive = true;
				}
				allRows.push(new FpRow(fWp.ident, fFpIdx, undefined, undefined, tmpFoundActive));

				// last app fix
				let appName = (flightPlanManager.getAirportApproach() !== undefined) ? flightPlanManager.getAirportApproach().name : 'APP';
				appName = `${allRows[allRows.length - 1].ident}.${appName}`;
				const wp = approachSeg.waypoints[approachSeg.waypoints.length - 1];
				const fpIdx = approachSeg.offset + (approachSeg.waypoints.length - 1);
				tmpFoundActive = !foundActive && flightPlanManager.getActiveWaypointIndex() <= fpIdx;
				if (tmpFoundActive) {
					foundActive = true;
				}
				allRows.push(new FpRow(wp.ident, fpIdx, appName, undefined, tmpFoundActive));
			}

		}

		return allRows;
	}
}

class FpRow {
	private _ident: string;
	private _fpIdx: number;
	private _airwayIn: any;
	private _airwayOut: any;
	private _isActive: boolean;
	private _isDeparture: boolean;

	constructor(ident = '-----', fpIdx = Infinity, airwayIn = undefined, airwayOut = undefined, isActive = false, isDeparture = false) {
		this._ident = ident;
		this._fpIdx = fpIdx;
		this._airwayIn = airwayIn;
		this._airwayOut = airwayOut;
		this._isActive = isActive;
		this._isDeparture = isDeparture;
	}

	get ident() {
		return this._ident;
	}

	set ident(val) {
		this._ident = val;
	}

	get fpIdx() {
		return this._fpIdx;
	}

	set fpIdx(val) {
		this._fpIdx = val;
	}

	get airwayOut() {
		return this._airwayOut;
	}

	set airwayOut(val) {
		this._airwayOut = val;
	}

	get airwayIn() {
		return this._airwayIn;
	}

	set airwayIn(val) {
		this._airwayIn = val;
	}


	get isDeparture() {
		return this._isDeparture;
	}

	set isDeparture(val) {
		this._isDeparture = val;
	}

	getTemplate(fmc: B787_10_FMC) {
		let row1tmpl, row2tmpl = ['', ''];
		if (this._airwayIn === undefined) {
			if (this._ident !== '-----') {
				row1tmpl = [fmc.makeSettable('DIRECT', 150), fmc.makeSettable(this._ident, 150)];
			} else {
				row1tmpl = [fmc.makeSettable('-----', 150), fmc.makeSettable(this._ident, 150)];

			}
		} else {
			row1tmpl = [fmc.makeSettable(this._airwayIn, 150), fmc.makeSettable(this._ident, 150)];
			if (this._ident === '-----') {
				row1tmpl[1] = fmc.makeSettable('□□□□□');
				row2tmpl = ['', '------------- DISCONTINUITY -------------', ''];
			}
		}

		if (this._isActive) {
			row1tmpl[0] += '';
			row1tmpl[1] += '';
		}

		return [row1tmpl, row2tmpl];
	}
}