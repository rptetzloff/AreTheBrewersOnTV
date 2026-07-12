        import { parseGamesCsv, computeSeasonHistory } from './records-core.js';
        import { computeHeadToHead, canonicalOpponent } from './h2h-core.js';
        import { buildChartSvg } from './history-chart.js';
        import { intentUrls, copyText, flashCopied } from './share-core.js';

        function buildSeasonMap(games) {
        	const map = {};
        	games.forEach(g => {
        		const yr = parseInt(g.season);
        		if (!map[yr]) map[yr] = [];
        		map[yr].push(g);
        	});
        	return map;
        }

        class BrewersTracker {
        	constructor() {
        		this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/mil/schedule';
        		this.countdownInterval = null;
        		this.liveUpdateInterval = null;
        		this.currentSeason = null;
        		this.latestSeason = null;
        		this.earliestSeason = 1969;
        		this.csvBySeason = {};
        		this.csvMaxSeason = 2020;
        		this.seasonRecords = {};
        		this.photosBySeason = {};
        		this.init();
        	}

        	async init() {
        		try {
        			const toggle = document.getElementById('emoji-toggle');
        			toggle.checked = this.showEmojis;
        			toggle.addEventListener('change', () => {
        				localStorage.setItem('showEmojis', toggle.checked ? 'true' : 'false');
        				if (this._isOffseason) {
        					this.displayOffseasonMessage();
        				} else if (this._lastResult) {
        					const { isUndefeated, wins, losses, ties, isPastSeason, superBowlName, postRecord, preRecord } = this._lastResult;
        					this.displayResult(isUndefeated, wins, losses, ties, isPastSeason, superBowlName, postRecord, preRecord);
        				}
        			});

        			['streak-details', 'otd-details'].forEach(id => {
        				const details = document.getElementById(id);
        				if (!details) return;
        				const stored = localStorage.getItem(`sectionOpen:${id}`);
        				if (stored !== null) details.open = stored === 'true';
        				details.addEventListener('toggle', () => {
        					localStorage.setItem(`sectionOpen:${id}`, details.open ? 'true' : 'false');
        				});
        			});

        			const [gamesRes, recordsRes, photosRes] = await Promise.all([
        				fetch('./data/brewers_games.csv'),
        				fetch('./data/brewers_season_records.csv'),
        				fetch('./data/photos.csv'),
        			]);
        			if (gamesRes.ok) {
        				const raw = await gamesRes.text();
        				const games = parseGamesCsv(raw);
        				this.csvBySeason = buildSeasonMap(games);
        				// name -> all-time head-to-head entry, for schedule annotations
        				this.h2hByName = new Map(computeHeadToHead(games).opponents.map(o => [o.name, o]));
        				this.seasonHistory = computeSeasonHistory(games);
        				this.renderHistorySpark();
        				const seasons = Object.keys(this.csvBySeason).map(Number).sort((a, b) => a - b);
        				if (seasons.length) {
        					this.earliestSeason = seasons[0];
        					this.csvMaxSeason = seasons[seasons.length - 1];
        				}
        			}
        			if (recordsRes.ok) {
        				const raw = await recordsRes.text();
        				parseGamesCsv(raw).forEach(r => {
        					this.seasonRecords[parseInt(r.season)] = r;
        				});
        			}
        			if (photosRes.ok) {
        				const raw = await photosRes.text();
        				parseGamesCsv(raw).forEach(p => {
        					const yr = parseInt(p.season);
        					if (!this.photosBySeason[yr]) this.photosBySeason[yr] = [];
        					this.photosBySeason[yr].push(p);
        				});
        			}
        			this.initGallery();
        			this.buildOnThisDay();
        			const params = new URLSearchParams(window.location.search);
        			const seasonParam = params.get('season');
        			const pathMatch = window.location.pathname.match(/\/(\d{4})\/?$/);
        			const requestedSeason = seasonParam
                    ? parseInt(seasonParam, 10)
                    : pathMatch ? parseInt(pathMatch[1], 10) : null;
                    await this.fetchBrewersData(requestedSeason || undefined);
                    this.setupSeasonSelector();
                } catch (error) {
                 this.showError('Failed to load Brewers data');
                 console.error('Error:', error);
             }
         }

         setupSeasonSelector() {
          const prevBtn = document.getElementById('season-prev');
          const nextBtn = document.getElementById('season-next');
          const prev10Btn = document.getElementById('season-prev10');
          const next10Btn = document.getElementById('season-next10');
          const firstBtn = document.getElementById('season-first');
          const lastBtn = document.getElementById('season-last');

          window.addEventListener('popstate', (e) => {
             const season = e.state?.season;
             if (season) this.loadSeason(season, false);
         });

          firstBtn.addEventListener('click', () => {
             if (this.currentSeason !== this.earliestSeason) this.loadSeason(this.earliestSeason);
         });

          lastBtn.addEventListener('click', () => {
             if (this.currentSeason !== this.latestSeason) this.loadSeason(this.latestSeason);
         });

          prev10Btn.addEventListener('click', () => {
             const target = Math.max(this.earliestSeason, this.currentSeason - 10);
             if (target !== this.currentSeason) this.loadSeason(target);
         });

          next10Btn.addEventListener('click', () => {
             const target = Math.min(this.latestSeason, this.currentSeason + 10);
             if (target !== this.currentSeason) this.loadSeason(target);
         });

          prevBtn.addEventListener('click', () => {
             if (this.currentSeason > this.earliestSeason) this.loadSeason(this.currentSeason - 1);
         });

          nextBtn.addEventListener('click', () => {
             if (this.currentSeason < this.latestSeason) this.loadSeason(this.currentSeason + 1);
         });
      }

      updateSiteTitle() {
          const el = document.getElementById('site-title');
          if (!el) return;
          const past = this.currentSeason && this.latestSeason && this.currentSeason < this.latestSeason;
          el.textContent = past
              ? `Were the Brewers Undefeated in ${this.currentSeason}?`
              : 'Are the Brewers Undefeated?';
      }

      // Compact franchise-history sparkline under the answer; the currently
      // viewed season gets a white marker. Links through to /history.
      renderHistorySpark() {
          const el = document.getElementById('history-spark');
          if (!el || !this.seasonHistory?.length) return;
          el.innerHTML = buildChartSvg(this.seasonHistory, {
              width: 600, height: 80,
              axes: false,
              highlight: this.currentSeason,
          });
      }

      updateSeasonSelector() {
          this.updateSiteTitle();
          this.renderHistorySpark();
          const label = document.getElementById('season-label');
          const prevBtn = document.getElementById('season-prev');
          const nextBtn = document.getElementById('season-next');
          const prev10Btn = document.getElementById('season-prev10');
          const next10Btn = document.getElementById('season-next10');
          const firstBtn = document.getElementById('season-first');
          const lastBtn = document.getElementById('season-last');

          label.textContent = `${this.currentSeason} Season`;
          prevBtn.disabled = this.currentSeason <= this.earliestSeason;
          nextBtn.disabled = this.currentSeason >= this.latestSeason;
          prev10Btn.disabled = this.currentSeason <= this.earliestSeason;
          next10Btn.disabled = this.currentSeason >= this.latestSeason;
          firstBtn.disabled = this.currentSeason <= this.earliestSeason;
          lastBtn.disabled = this.currentSeason >= this.latestSeason;

          const existingBtn = document.getElementById('gallery-open-btn');
          if (existingBtn) existingBtn.remove();
          if (this.photosBySeason[this.currentSeason]?.length) {
             const btn = document.createElement('button');
             btn.id = 'gallery-open-btn';
             btn.className = 'gallery-btn';
             btn.innerHTML = '<i class="mdi mdi-image-multiple"></i> Photos';
             btn.addEventListener('click', () => this.openGallery(this.currentSeason));
             const selector = document.getElementById('season-selector');
             selector.insertAdjacentElement('afterend', btn);
         }
     }

     async loadSeason(year, pushState = true) {
      if (this.liveUpdateInterval) {
         clearInterval(this.liveUpdateInterval);
         this.liveUpdateInterval = null;
     }
     const answerEl = document.getElementById('answer');
     const recordEl = document.getElementById('record');
     const streakEl = document.getElementById('streak-banner');
     answerEl.innerHTML = 'Loading...';
     answerEl.className = 'answer loading';
     recordEl.textContent = '';
     if (streakEl) streakEl.hidden = true;
     document.getElementById('schedule-grid').innerHTML = '<div class="loading">Loading schedule...</div>';

     if (pushState) {
         const url = new URL(window.location.href);
         url.pathname = `/${year}`;
         url.searchParams.delete('season');
         history.pushState({ season: year }, '', url.toString());
     }

     try {
         await this.fetchBrewersData(year);
     } catch (error) {
         this.showError('Failed to load season data');
     }
 }

 usesCsvData(season) {
  return season != null && season <= this.csvMaxSeason && this.csvBySeason[season] != null;
}

async fetchBrewersData(season) {
        		// For seasons covered by the CSV, use local data
  if (season && this.usesCsvData(season)) {
     this.processCsvSeasonData(season);
     return;
 }

 try {
     const seasonParam = season ? `&season=${season}` : '';
     const [preRes, regularRes, postRes] = await Promise.all([
        fetch(`${this.apiUrl}?seasontype=1${seasonParam}`),
        fetch(`${this.apiUrl}?seasontype=2${seasonParam}`),
        fetch(`${this.apiUrl}?seasontype=3${seasonParam}`),
    ]);
     const [preData, regularData, postData] = await Promise.all([
        preRes.json(),
        regularRes.json(),
        postRes.json(),
    ]);

     const preEvents = (preData.events || []).map(e => ({ ...e, _seasonType: 'pre' }));
     const regularEvents = (regularData.events || []).map(e => ({ ...e, _seasonType: 'regular' }));
     const postEvents = (postData.events || []).map(e => ({ ...e, _seasonType: 'post' }));
     const allEvents = [...preEvents, ...regularEvents, ...postEvents];

     const mergedData = { ...regularData, events: allEvents };

        			// If ESPN returns no events and we have CSV data, fall back to CSV
     if (allEvents.length === 0 && season && this.usesCsvData(season)) {
        this.processCsvSeasonData(season);
        return;
    }

    const liveGame = allEvents.find(event => {
        const status = event.competitions?.[0]?.status?.type?.name;
        return status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME' || status === 'STATUS_DELAYED';
    });

    if (liveGame) {
        await this.fetchLiveGameScore(liveGame, mergedData);
    } else {
        this.processScheduleData(mergedData);
    }
} catch (error) {
        			// If ESPN fetch fails and we have CSV data for this season, use it
 if (season && this.usesCsvData(season)) {
    this.processCsvSeasonData(season);
} else {
    this.processScheduleData({ events: [] });
}
}
}

processCsvSeasonData(season) {
  const games = this.csvBySeason[season] || [];

  this.currentSeason = season;
  if (!this.latestSeason) {
        			// Determine latest season from ESPN on first load — but if we're bootstrapping
        			// from a CSV season directly, use the current year as a proxy
     this.latestSeason = new Date().getFullYear();
 }
 this.updateSeasonSelector();

 document.getElementById('schedule-title').innerHTML = `<i class="mdi mdi-calendar-month"></i> ${season} Season Schedule`;

        		// Tally regular season and playoff records from CSV
 let wins = 0, losses = 0, ties = 0;
 let postWins = 0, postLosses = 0, postTies = 0;

 games.forEach(g => {
     const result = g['Brewers Win'];
     const isPlayoff = g.playoff === '1';
     const isRegular = g.regular_season === '1';

     if (isRegular) {
        if (result === 'WIN') wins++;
        else if (result === 'LOSS') losses++;
        else if (result === 'TIE') ties++;
    } else if (isPlayoff) {
        if (result === 'WIN') postWins++;
        else if (result === 'LOSS') postLosses++;
        else if (result === 'TIE') postTies++;
    }
});

        		// Check for World Series win (worldseries column is non-empty)
 let worldSeriesName = null;
 games.forEach(g => {
     if (g.worldseries && g.worldseries.trim() !== '' && g['Brewers Win'] === 'WIN') {
        worldSeriesName = `World Series ${g.worldseries.toUpperCase()}`;
    }
});

 const isUndefeated = losses === 0 && wins > 0;
 const postRecord = (postWins > 0 || postLosses > 0) ? { w: postWins, l: postLosses, t: postTies } : null;

 this.displayResult(isUndefeated, wins, losses, ties, true, worldSeriesName, postRecord, null);
 this.displayCsvSchedule(games, season);
 this.showLastUpdated();
 this.setDataCredit(true);
 this.updateLastUndefeated(wins, losses);
 this.setupShareButtons();

 const csvCompletedGames = games
 .filter(g => g.regular_season === '1' && g['Brewers Win'])
 .map(g => ({ result: g['Brewers Win'], date: new Date(g.date) }));
 this.updateStreakBanner(csvCompletedGames, season !== this.latestSeason);
}

// All-time head-to-head note linking to the opponent's rivalry page.
// Returns null for opponents with no CSV history (shouldn't happen).
h2hNote(opponentName) {
  const o = this.h2hByName?.get(canonicalOpponent(opponentName));
  if (!o) return null;
  const note = document.createElement('a');
  note.className = 'game-h2h';
  note.href = `/vs/${o.slug}`;
  note.textContent = `All-time: ${o.record}`;
  note.title = `Brewers vs ${o.name} — all-time head-to-head`;
  return note;
}

displayCsvSchedule(games, season) {
  const scheduleGrid = document.getElementById('schedule-grid');
  scheduleGrid.innerHTML = '';

  // Head-to-head notes only make sense on the current season's schedule.
  const showH2h = season === this.latestSeason;

        		// Sort by date
  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));

  let currentSection = null;
  sorted.forEach(g => {
     const isPlayoff = g.playoff === '1';
     const isRegular = g.regular_season === '1';
     const section = isPlayoff ? 'post' : (isRegular ? 'regular' : 'other');
     const sectionLabels = { post: 'Playoffs', regular: 'Regular Season', other: 'Other' };

     if (section !== currentSection) {
        currentSection = section;
        const divider = document.createElement('div');
        divider.className = 'season-divider';
        divider.textContent = sectionLabels[section] || section;
        scheduleGrid.appendChild(divider);
    }

    scheduleGrid.appendChild(this.createCsvGameItem(g, showH2h));
});
}

createCsvGameItem(g, showH2h = false) {
        		const result = g['Brewers Win']; // WIN / LOSS / TIE
        		const opponent = g.Opponent;
        		const location = g.location; // HOME / AWAY / NEUTRAL
        		const brewersScore = parseInt(g.brewers_score) || 0;
        		const opponentScore = parseInt(g.opponent_score) || 0;
        		const date = new Date(g.date);
        		const isWorldSeries = g.worldseries && g.worldseries.trim() !== '';

        		const gameItem = document.createElement('div');
        		gameItem.className = 'game-item completed';

        		if (result === 'WIN') gameItem.classList.add('win');
        		else if (result === 'LOSS') gameItem.classList.add('loss');

        		const gameInfo = document.createElement('div');
        		gameInfo.className = 'game-info';

        		const gameDetails = document.createElement('div');
        		gameDetails.className = 'game-details';

        		const opponentDiv = document.createElement('div');
        		opponentDiv.className = 'game-opponent';
        		const prefix = location === 'HOME' ? 'vs' : location === 'AWAY' ? '@' : 'vs';
        		opponentDiv.textContent = `${prefix} ${opponent}`;

        		const dateDiv = document.createElement('div');
        		dateDiv.className = 'game-date';
        		dateDiv.textContent = date.toLocaleDateString('en-US', {
        			weekday: 'short', month: 'short', day: 'numeric'
        		});

        		gameDetails.appendChild(opponentDiv);
        		gameDetails.appendChild(dateDiv);

        		if (showH2h) {
        			const h2h = this.h2hNote(opponent);
        			if (h2h) gameDetails.appendChild(h2h);
        		}

        		if (isWorldSeries) {
        			const sbLabel = document.createElement('div');
        			sbLabel.className = 'game-status';
        			sbLabel.textContent = `World Series ${g.worldseries.toUpperCase()}`;
        			gameDetails.appendChild(sbLabel);
        		}

        		gameInfo.appendChild(gameDetails);
        		gameItem.appendChild(gameInfo);

        		const scoreDiv = document.createElement('div');
        		scoreDiv.className = 'game-score';
        		if (result === 'WIN') scoreDiv.classList.add('win');
        		else if (result === 'LOSS') scoreDiv.classList.add('loss');

        		const resultPrefix = result === 'WIN' ? 'W ' : result === 'LOSS' ? 'L ' : 'T ';
        		scoreDiv.textContent = `${resultPrefix}${brewersScore}-${opponentScore}`;
        		scoreDiv.style.textAlign = 'center';
        		scoreDiv.style.marginTop = '0.5rem';
        		scoreDiv.style.width = '100%';

        		gameItem.appendChild(scoreDiv);
        		return gameItem;
        	}

        	async fetchLiveGameScore(liveGame, scheduleData) {
        		try {
        			const gameId = liveGame.id;
        			const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`;
        			const response = await fetch(scoreboardUrl);
        			const scoreboardData = await response.json();

        			const currentGame = scoreboardData.events?.find(event => event.id === gameId);

        			if (currentGame && currentGame.competitions?.[0]?.competitors) {
        				currentGame.competitions[0].competitors.forEach(competitor => {
        					const teamId = competitor.team.id;
        					const score = competitor.score;
        					const scheduleCompetitor = liveGame.competitions[0].competitors.find(comp => comp.team.id === teamId);
        					if (scheduleCompetitor && score) {
        						scheduleCompetitor.score = score;
        					}
        				});

        				if (currentGame.competitions?.[0]?.situation) {
        					const situation = currentGame.competitions[0].situation;
        					liveGame.lastPlay = {
        						downDistanceText: situation.downDistanceText,
        						possession: situation.possession,
        						drive: situation.lastPlay?.drive,
        						text: situation.lastPlay?.text
        					};
        				}
        			} else {
        				const boxscoreUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}`;
        				const boxResponse = await fetch(boxscoreUrl);
        				const boxscoreData = await boxResponse.json();

        				if (boxscoreData.header?.competitions?.[0]?.competitors) {
        					boxscoreData.header.competitions[0].competitors.forEach(competitor => {
        						const teamId = competitor.team.id;
        						const score = competitor.score;
        						const scheduleCompetitor = liveGame.competitions[0].competitors.find(comp => comp.team.id === teamId);
        						if (scheduleCompetitor && score) {
        							scheduleCompetitor.score = score;
        						}
        					});
        				}

        				if (boxscoreData.drives?.current?.plays?.length > 0) {
        					const lastPlay = boxscoreData.drives.current.plays[boxscoreData.drives.current.plays.length - 1];
        					liveGame.lastPlay = {
        						downDistanceText: boxscoreData.situation?.downDistanceText,
        						possession: boxscoreData.situation?.possession,
        						drive: { description: boxscoreData.drives?.current?.description },
        						text: lastPlay.text || lastPlay.description
        					};
        				} else if (boxscoreData.situation) {
        					liveGame.lastPlay = {
        						downDistanceText: boxscoreData.situation.downDistanceText,
        						possession: boxscoreData.situation.possession,
        						drive: boxscoreData.situation.lastPlay?.drive,
        						text: boxscoreData.situation.lastPlay?.text
        					};
        				}
        			}

        			this.processScheduleData(scheduleData);
        		} catch (error) {
        			this.processScheduleData(scheduleData);
        		}
        	}

        	processScheduleData(data) {
        		const events = data.events || [];

        		const seasonData = data.requestedSeason || data.season;
        		const season = seasonData?.year;
        		const seasonType = seasonData?.name;
        		this.updateScheduleTitle(season, seasonType);

        		if (season) {
        			this.currentSeason = season;
        			if (!this.latestSeason) this.latestSeason = season;
        			this.updateSeasonSelector();
        		}

        		const isPastSeason = this.currentSeason && this.latestSeason && this.currentSeason < this.latestSeason;
        		if (!isPastSeason && this.isOffseason(events)) {
        			this.displayOffseasonMessage();
        			this.displaySchedule(events, true);
        			this.showLastUpdated();
        			this.updateLastUndefeated(0, 0);
        			this.setupShareButtons();
        			const el = document.getElementById('streak-banner');
        			if (el) el.hidden = true;
        			return;
        		}

        		const countRecord = (gameList) => {
        			let w = 0, l = 0, t = 0;
        			gameList.forEach(event => {
        				const competitors = event.competitions[0].competitors;
        				let brewersScore = 0, opponentScore = 0;
        				competitors.forEach(competitor => {
        					if (competitor.team.abbreviation === 'MIL') {
        						brewersScore = parseInt(competitor.score.value) || 0;
        					} else {
        						opponentScore = parseInt(competitor.score.value) || 0;
        					}
        				});
        				if (brewersScore > opponentScore) w++;
        				else if (brewersScore < opponentScore) l++;
        				else t++;
        			});
        			return { w, l, t };
        		};

        		const completedPre = events.filter(event => {
        			const status = event.competitions?.[0]?.status?.type?.name;
        			return status === 'STATUS_FINAL' && event._seasonType === 'pre';
        		});

        		const completedRegular = events.filter(event => {
        			const status = event.competitions?.[0]?.status?.type?.name;
        			return status === 'STATUS_FINAL' && event._seasonType === 'regular';
        		});

        		const completedPost = events.filter(event => {
        			const status = event.competitions?.[0]?.status?.type?.name;
        			return status === 'STATUS_FINAL' && event._seasonType === 'post';
        		});

        		const preRecord = countRecord(completedPre);
        		const { w: wins, l: losses, t: ties } = countRecord(completedRegular);
        		const postRecord = countRecord(completedPost);

        		let worldSeriesName = null;
        		completedPost.forEach(event => {
        			const notes = event.competitions?.[0]?.notes || [];
        			const sbNote = notes.find(n => /world series/i.test(n.headline || ''));
        			if (!sbNote) return;
        			const competitors = event.competitions[0].competitors;
        			let brewersScore = 0, opponentScore = 0;
        			competitors.forEach(c => {
        				if (c.team.abbreviation === 'MIL') brewersScore = parseInt(c.score?.value) || 0;
        				else opponentScore = parseInt(c.score?.value) || 0;
        			});
        			if (brewersScore > opponentScore) worldSeriesName = sbNote.headline;
        		});

        		const isUndefeated = losses === 0 && wins > 0;
        		this.displayResult(isUndefeated, wins, losses, ties, isPastSeason, worldSeriesName, postRecord, preRecord);
        		this.displaySchedule(events, isPastSeason);
        		this.showLastUpdated();
        		this.setDataCredit(false);
        		this.updateLastUndefeated(wins, losses);
        		this.setupShareButtons();

        		const espnCompletedGames = completedRegular.map(event => {
        			const competitors = event.competitions[0].competitors;
        			let brewersScore = 0, opponentScore = 0;
        			competitors.forEach(c => {
        				if (c.team.abbreviation === 'MIL') brewersScore = parseInt(c.score?.value || c.score || 0);
        				else opponentScore = parseInt(c.score?.value || c.score || 0);
        			});
        			const result = brewersScore > opponentScore ? 'WIN' : brewersScore < opponentScore ? 'LOSS' : 'TIE';
        			return { result, date: new Date(event.date) };
        		});
        		this.updateStreakBanner(espnCompletedGames, isPastSeason);
        	}

        	updateScheduleTitle(year, seasonType) {
        		const titleEl = document.getElementById('schedule-title');
        		if (!titleEl) return;
        		const yearLabel = year ? `${year} ` : '';
        		const isRegular = !seasonType || seasonType.toLowerCase().includes('regular');
        		const typeLabel = !isRegular ? ` (${seasonType})` : '';
        		titleEl.innerHTML = `<i class="mdi mdi-calendar-month"></i> ${yearLabel}Season Schedule${typeLabel}`;
        	}

        	isOffseason(events) {
        		const now = new Date();
        		const isOffseasonMonth = now.getMonth() >= 10 || now.getMonth() <= 2;
        		const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        		const hasUpcomingGames = events.some(event => {
        			const gameDate = new Date(event.date);
        			const status = event.competitions?.[0]?.status?.type?.name;
        			return gameDate > now && gameDate <= thirtyDaysFromNow && status === 'STATUS_SCHEDULED';
        		});
        		return isOffseasonMonth && !hasUpcomingGames;
        	}

        	displayOffseasonMessage() {
        		const answerEl = document.getElementById('answer');
        		const recordEl = document.getElementById('record');

        		const baseballHtml = this.showEmojis ? '⚾<br>' : '';
        		this._lastResult = null;
        		this._isOffseason = true;
        		answerEl.innerHTML = `${baseballHtml}OFFSEASON`;
        		answerEl.className = 'answer offseason';
        		document.body.classList.remove('undefeated');
        		document.body.classList.add('offseason');

        		recordEl.textContent = 'The season hasn\'t started yet!';
        	}

        	get showEmojis() {
        		return localStorage.getItem('showEmojis') !== 'false';
        	}

        	emojiRowHtml(emoji, count) {
        		if (count <= 0) return '';
        		const spans = Array.from({ length: count }, () => `<span>${emoji}</span>`).join('');
        		return `<div class="emoji-row">${spans}</div>`;
        	}

        	displayResult(isUndefeated, wins, losses, ties, isPastSeason = false, worldSeriesName = null, postRecord = null, preRecord = null) {
        		const answerEl = document.getElementById('answer');
        		const recordEl = document.getElementById('record');

        		this._lastResult = { isUndefeated, wins, losses, ties, isPastSeason, worldSeriesName, postRecord, preRecord };
        		this._isOffseason = false;

        		const emojis = this.showEmojis;

        		if (isUndefeated) {
        			const baseballHtml = emojis && wins > 0 ? this.emojiRowHtml('⚾', wins) : '';
        			const beerHtml = emojis && !isPastSeason ? this.emojiRowHtml('🍺', 1) : '';
        			answerEl.innerHTML = `${baseballHtml}YES!!!${beerHtml}`;
        			answerEl.className = 'answer yes';
        			document.body.classList.add('undefeated');
        		} else if (worldSeriesName) {
        			answerEl.innerHTML = `🏆⚾🍺<br>${worldSeriesName.toUpperCase()}<br>CHAMPIONS!<br>🎉🎊🎉`;
        			answerEl.className = 'answer champions';
        			document.body.classList.remove('undefeated');
        		} else {
        			const baseballHtml = emojis && wins > 0 ? this.emojiRowHtml('⚾', wins) : '';
        			const beerHtml = emojis && !isPastSeason ? this.emojiRowHtml('🍺', 1) : '';
        			const frownHtml = emojis && losses > 0 ? this.emojiRowHtml('😢', losses) : '';
        			answerEl.innerHTML = `${baseballHtml}NO${beerHtml}${frownHtml}`;
        			answerEl.className = 'answer no';
        			document.body.classList.remove('undefeated');
        		}

        		const recordLabel = isPastSeason ? 'Final Record' : 'Current Record';
        		const regularText = ties > 0
             ? `${recordLabel}: ${wins}-${losses}-${ties}`
             : `${recordLabel}: ${wins}-${losses}`;

             const hasPreGames = preRecord && (preRecord.w > 0 || preRecord.l > 0);
             const hasPostGames = postRecord && (postRecord.w > 0 || postRecord.l > 0);

             const preText = hasPreGames
             ? (preRecord.t > 0
                ? `Preseason: ${preRecord.w}-${preRecord.l}-${preRecord.t}`
                : `Preseason: ${preRecord.w}-${preRecord.l}`)
             : null;

             const postText = hasPostGames
             ? (postRecord.t > 0
                ? `Playoff Record: ${postRecord.w}-${postRecord.l}-${postRecord.t}`
                : `Playoff Record: ${postRecord.w}-${postRecord.l}`)
             : null;

             let html = '';
             if (preText) html += `<span class="preseason-record">${preText}</span><br>`;
             html += regularText;
             if (postText) html += `<br><span class="playoff-record">${postText}</span>`;
             recordEl.innerHTML = html;
         }

         displaySchedule(events, isPastSeason = false) {
          const scheduleGrid = document.getElementById('schedule-grid');
          const now = new Date();

          const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));

          const nextGame = sortedEvents.find(event => {
             const gameDate = new Date(event.date);
             const status = event.competitions?.[0]?.status?.type?.name;
             return gameDate > now && status === 'STATUS_SCHEDULED';
         });

          const liveGame = sortedEvents.find(event => {
             const status = event.competitions?.[0]?.status?.type?.name;
             return status === 'STATUS_IN_PROGRESS' ||
             status === 'STATUS_HALFTIME' ||
             status === 'STATUS_DELAYED' ||
             status === 'STATUS_BREAK' ||
             status === 'STATUS_TIMEOUT' ||
             status === 'STATUS_END_PERIOD' ||
             status === 'STATUS_RAIN_DELAY';
         });

          scheduleGrid.innerHTML = '';

          const sectionLabels = { pre: 'Preseason', regular: 'Regular Season', post: 'Playoffs' };
          let currentSection = null;
          sortedEvents.forEach(event => {
             const section = event._seasonType;
             if (section && section !== currentSection) {
                currentSection = section;
                const divider = document.createElement('div');
                divider.className = 'season-divider';
                divider.textContent = sectionLabels[section] || section;
                scheduleGrid.appendChild(divider);
            }
            const gameItem = this.createGameItem(event, nextGame, liveGame, now);
            scheduleGrid.appendChild(gameItem);
        });

          if (!isPastSeason) {
             setTimeout(() => {
                this.autoScrollToRecentGame(scheduleGrid, sortedEvents, now);
            }, 500);

             if (liveGame) {
                this.startLiveUpdates();
            }
        }
    }

    autoScrollToRecentGame(scheduleGrid, sortedEvents, now) {
      let mostRecentCompletedIndex = -1;

      for (let i = sortedEvents.length - 1; i >= 0; i--) {
         const event = sortedEvents[i];
         const status = event.competitions?.[0]?.status?.type?.name;

         if (status === 'STATUS_IN_PROGRESS' ||
            status === 'STATUS_HALFTIME' ||
            status === 'STATUS_DELAYED' ||
            status === 'STATUS_FINAL') {
            mostRecentCompletedIndex = i;
        break;
    }
}

if (mostRecentCompletedIndex >= 0) {
 const gameItems = scheduleGrid.children;
 if (gameItems[mostRecentCompletedIndex]) {
    const gameItem = gameItems[mostRecentCompletedIndex];
    const containerHeight = scheduleGrid.clientHeight;
    const itemHeight = gameItem.offsetHeight;
    const itemTop = gameItem.offsetTop;
    const scrollTop = itemTop - (containerHeight / 2) + (itemHeight / 2);

    scheduleGrid.scrollTo({
       top: Math.max(0, scrollTop),
       behavior: 'smooth'
   });
}
}
}

createGameItem(event, nextGame, liveGame, now) {
  const competition = event.competitions[0];
  const competitors = competition.competitors;
  const status = competition.status;
  const date = new Date(event.date);

  const isLive = liveGame && event.id === liveGame.id;

  let brewersScore = 0;
  let opponentScore = 0;
  let opponent = '';
  let isHome = false;

  competitors.forEach(competitor => {
     if (competitor.team.abbreviation === 'MIL') {
        brewersScore = parseInt(
           competitor.score?.value ||
           competitor.score?.displayValue ||
           competitor.score ||
           0
           );
        isHome = competitor.homeAway === 'home';
    } else {
        opponentScore = parseInt(
           competitor.score?.value ||
           competitor.score?.displayValue ||
           competitor.score ||
           0
           );
        opponent = competitor.team.displayName;
    }
});

  const gameItem = document.createElement('div');
  gameItem.className = 'game-item';

  const isNext = nextGame && event.id === nextGame.id && !isLive;
  const isCompleted = status.type.name === 'STATUS_FINAL';
  const isInProgress = status.type.name === 'STATUS_IN_PROGRESS' ||
  status.type.name === 'STATUS_HALFTIME' ||
  status.type.name === 'STATUS_DELAYED' ||
  status.type.name === 'STATUS_BREAK' ||
  status.type.name === 'STATUS_TIMEOUT' ||
  status.type.name === 'STATUS_END_PERIOD' ||
  status.type.name === 'STATUS_RAIN_DELAY';

  if (isLive) {
     gameItem.classList.add('live');
 } else if (isNext) {
     gameItem.classList.add('next');
 } else if (isCompleted) {
     gameItem.classList.add('completed');
     if (brewersScore > opponentScore) {
        gameItem.classList.add('win');
    } else if (brewersScore < opponentScore) {
        gameItem.classList.add('loss');
    }
}

const gameInfo = document.createElement('div');
gameInfo.className = 'game-info';

const gameDetails = document.createElement('div');
gameDetails.className = 'game-details';

const opponentDiv = document.createElement('div');
opponentDiv.className = 'game-opponent';
opponentDiv.textContent = `${isHome ? 'vs' : '@'} ${opponent}`;

const dateDiv = document.createElement('div');
dateDiv.className = 'game-date';

const network = competition.broadcasts?.[0]?.media?.shortName || '';

if (isLive || isInProgress) {
 dateDiv.innerHTML = `<span class="live-indicator-small"></span>LIVE NOW${network ? ` · <span class="game-network">${network}</span>` : ''}`;
} else {
 const dateText = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});
 dateDiv.innerHTML = network
 ? `${dateText} · <span class="game-network">${network}</span>`
 : dateText;
}

gameDetails.appendChild(opponentDiv);
gameDetails.appendChild(dateDiv);

// H2H notes only on the current season's schedule (offseason included —
// displaySchedule's isPastSeason arg also covers "don't autoscroll", so
// key off the season instead).
if (this.currentSeason === this.latestSeason) {
 const h2h = this.h2hNote(opponent);
 if (h2h) gameDetails.appendChild(h2h);
}

if (isLive || isInProgress) {
 const statusDiv = document.createElement('div');
 statusDiv.className = 'game-status';
 statusDiv.textContent = status.type.detail || status.type.shortDetail || 'Live';
 gameDetails.appendChild(statusDiv);

 if (event.lastPlay) {
    const lastPlayDiv = document.createElement('div');
    lastPlayDiv.className = 'last-play';

    let playText = '';
    if (event.lastPlay.possession) {
       const possessionTeam = competitors.find(comp => comp.team.id == event.lastPlay.possession);
       const teamName = possessionTeam ? possessionTeam.team.abbreviation : event.lastPlay.possession;
       playText += `${teamName} Ball\n`;
   }
   if (event.lastPlay.downDistanceText) {
       playText += event.lastPlay.downDistanceText + '\n';
   }
   if (event.lastPlay.drive?.description) {
       let driveTeam = '';
       if (event.lastPlay.drive.team) {
          const driveTeamData = competitors.find(comp => comp.team.id == event.lastPlay.drive.team);
          driveTeam = driveTeamData ? `${driveTeamData.team.abbreviation} ` : '';
      }
      playText += `${driveTeam}Drive: ${event.lastPlay.drive.description}\n`;
  }
  if (event.lastPlay.text) {
   playText += `\nLast Play:\n${event.lastPlay.text}`;
}

if (playText.trim()) {
   lastPlayDiv.textContent = playText.trim();
   gameDetails.appendChild(lastPlayDiv);
}
}
}

if (isNext) {
 const countdownDiv = document.createElement('div');
 countdownDiv.className = 'countdown-small';

 const timeLeft = date - now;
 if (timeLeft > 0) {
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    let countdownText = '⏰ ';
    if (days > 0) countdownText += `${days}d ${hours}h ${minutes}m`;
    else if (hours > 0) countdownText += `${hours}h ${minutes}m`;
    else countdownText += `${minutes}m`;

    countdownDiv.textContent = countdownText;
} else {
    countdownDiv.textContent = '⏰ Game Time!';
}

gameDetails.appendChild(countdownDiv);
}

gameInfo.appendChild(gameDetails);
gameItem.appendChild(gameInfo);

if (isCompleted) {
 const scoreDiv = document.createElement('div');
 scoreDiv.className = 'game-score';

 let resultIndicator = '';
 if (brewersScore > opponentScore) {
    scoreDiv.classList.add('win');
    resultIndicator = 'W ';
} else if (brewersScore < opponentScore) {
    scoreDiv.classList.add('loss');
    resultIndicator = 'L ';
} else {
    resultIndicator = 'T ';
}

const scoreLink = document.createElement('a');
scoreLink.href = `https://www.espn.com/mlb/game/_/gameId/${event.id}`;
scoreLink.target = '_blank';
scoreLink.rel = 'noopener noreferrer';
scoreLink.textContent = `${resultIndicator}${brewersScore}-${opponentScore}`;
scoreLink.style.color = 'inherit';
scoreLink.style.textDecoration = 'none';

scoreDiv.appendChild(scoreLink);
scoreDiv.style.textAlign = 'center';
scoreDiv.style.marginTop = '0.5rem';
scoreDiv.style.width = '100%';
gameItem.appendChild(scoreDiv);
} else if (isLive || isInProgress) {
 const scoreDiv = document.createElement('div');
 scoreDiv.className = 'game-score live';

 const scoreLink = document.createElement('a');
 scoreLink.href = `https://www.espn.com/mlb/game/_/gameId/${event.id}`;
 scoreLink.target = '_blank';
 scoreLink.rel = 'noopener noreferrer';
 scoreLink.textContent = `${brewersScore}-${opponentScore}`;
 scoreLink.style.color = 'inherit';
 scoreLink.style.textDecoration = 'none';

 scoreDiv.appendChild(scoreLink);
 scoreDiv.style.textAlign = 'center';
 scoreDiv.style.marginTop = '0.5rem';
 scoreDiv.style.width = '100%';
 gameItem.appendChild(scoreDiv);
}

return gameItem;
}

startLiveUpdates() {
  if (this.liveUpdateInterval) clearInterval(this.liveUpdateInterval);
  if (this.countdownInterval) clearInterval(this.countdownInterval);

  this.liveUpdateInterval = setInterval(async () => {
     try {
        await this.fetchBrewersData();
    } catch (error) {
        console.error('Error updating live game:', error);
    }
}, 30000);
}

setDataCredit(show) {
  const el = document.getElementById('data-credit');
  if (el) el.style.display = show ? '' : 'none';
}

showLastUpdated() {
  const el = document.getElementById('last-updated');
  const now = new Date();
  el.textContent = `Last updated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
}

setupShareButtons() {
   if (this._shareSetup) {
      this.updateIntentLinks();
      return;
  }
  this._shareSetup = true;

  const nativeBtn = document.getElementById('share-native');
  const copyBtn = document.getElementById('share-copy');

  if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', () => this.nativeShare());
  } else {
      document.getElementById('share-x').hidden = false;
      document.getElementById('share-bsky').hidden = false;
      document.getElementById('share-fb').hidden = false;
      document.getElementById('share-reddit').hidden = false;
  }

        	// Always offer Copy — even on browsers that support the native share sheet,
        	// so there's an always-available button with visible click feedback.
  copyBtn.hidden = false;
  copyBtn.addEventListener('click', () => this.copyLink());

  this.updateIntentLinks();
}

getShareMessage() {
  const season = this.currentSeason;
  const isPast = season && this.latestSeason && season < this.latestSeason;

  if (this._isOffseason) {
     return `⚾ Milwaukee Brewers offseason - can't wait for the ${season} season! #ThisIsMyCrew`;
 }

 if (!this._lastResult) return `Milwaukee Brewers ${season} season #ThisIsMyCrew`;

 const { isUndefeated, wins, losses, ties, worldSeriesName } = this._lastResult;

 if (worldSeriesName) {
     return `🏆 The ${season} Milwaukee Brewers won ${worldSeriesName.toUpperCase()}! #ThisIsMyCrew`;
 }

 const recordText = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

 if (isPast) {
     if (isUndefeated) {
        return `⚾ The ${season} Milwaukee Brewers finished the regular season UNDEFEATED at ${recordText}! #ThisIsMyCrew`;
    } else {
        return `The ${season} Milwaukee Brewers finished ${recordText}. #ThisIsMyCrew`;
    }
} else {
 if (isUndefeated) {
    return `⚾ The Milwaukee Brewers are UNDEFEATED so far in ${season}! ${recordText} ⚾ #ThisIsMyCrew`;
} else {
    return `The Milwaukee Brewers are ${recordText} so far in the ${season} season. #ThisIsMyCrew`;
}
}
}

updateIntentLinks() {
  const links = intentUrls(this.getShareMessage(), window.location.href);
  for (const [key, id] of [['x', 'share-x'], ['bsky', 'share-bsky'], ['fb', 'share-fb'], ['reddit', 'share-reddit']]) {
    const btn = document.getElementById(id);
    if (btn) btn.href = links[key];
  }
}

async nativeShare() {
  const message = this.getShareMessage();
  const url = window.location.href;
  try {
     await navigator.share({ text: message, url });
 } catch (err) {
     if (err.name !== 'AbortError') this.copyLink();
 }
}

async copyLink() {
    const copyBtn = document.getElementById('share-copy');
    const shareText = `${this.getShareMessage()}\n\nCheck it out: ${window.location.href}`;
        // Flash FIRST, synchronously on click, so feedback never depends on the
        // clipboard call succeeding or on a permission prompt.
    flashCopied(copyBtn, '<i class="mdi mdi-check share-icon"></i>Copied!');
    await copyText(shareText);
}

buildOnThisDay() {
  const el = document.getElementById('on-this-day');
  if (!el) return;

  const dateParam = new URLSearchParams(window.location.search).get('otd');
  const today = dateParam ? new Date(`2000-${dateParam}`) : new Date();
  const todayMonth = isNaN(today) ? new Date().getMonth() : today.getMonth();
  const todayDay = isNaN(today) ? new Date().getDate() : today.getDate();

  const candidates = [];
  for (const [yr, games] of Object.entries(this.csvBySeason)) {
     for (const g of games) {
        if (!g.date) continue;
        const d = new Date(g.date);
        if (isNaN(d)) continue;
        const diff = Math.abs((d.getMonth() * 31 + d.getDate()) - (todayMonth * 31 + todayDay));
        if (diff <= 3) candidates.push({ game: g, season: parseInt(yr), date: d });
    }
}

if (candidates.length === 0) { el.hidden = true; return; }

const withPhotos = candidates.filter(c => this.photosBySeason[c.season]);
const pool = withPhotos.length > 0 ? withPhotos : candidates;
this._renderOnThisDay(el, pool[Math.floor(Math.random() * pool.length)], pool);
}

_renderOnThisDay(el, pick, pool) {
  const { game, season, date } = pick;
  const result = game['Brewers Win'];
  const opponent = game['Opponent'] || game['opponent'] || 'Unknown';
  const brewersScore = game['brewers_score'];
  const oppScore = game['opponent_score'];
  const isPlayoff = game['playoff'] === '1' || game['playoff'] === 'true';
  const isWorldSeries = game['worldseries'] && game['worldseries'] !== '';

  const resultClass = result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'tie';
  const resultLabel = result === 'WIN' ? 'W' : result === 'LOSS' ? 'L' : 'T';
  const scoreText = brewersScore && oppScore ? `${brewersScore}–${oppScore}` : '';
  const gameTypeLabel = isWorldSeries ? 'World Series' : isPlayoff ? 'Playoff' : 'Regular Season';
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const photos = this.photosBySeason[season] || [];
  const photo = photos.length ? photos[Math.floor(Math.random() * photos.length)] : null;

  const otdParam = new URLSearchParams(window.location.search).get('otd');
  const resetLink = otdParam
  ? `<a class="otd-reset" href="${window.location.pathname}" aria-label="Reset date override">Using ${otdParam} &times;</a>`
  : '';

  el.innerHTML = `
        			<div class="otd-header">
        				<span class="otd-label"><i class="mdi mdi-calendar-today"></i> On This Day in Brewers History</span>
        				<span class="otd-actions">
        					${resetLink}
        					<button class="otd-refresh" id="otd-refresh" aria-label="Show another"><i class="mdi mdi-refresh"></i></button>
        				</span>
        			</div>
        			<div class="otd-body">
    ${photo ? `<a href="${photo.url}" target="_blank" rel="noopener noreferrer" class="otd-photo-link"><img class="otd-photo" src="${photo.url}" alt="${photo.caption || ''}" loading="lazy"></a>` : ''}
        				<div class="otd-info">
        					<div class="otd-season-link">
        						<a href="/${season}" class="otd-year">${season} Season</a>
        						<span class="otd-game-type">${gameTypeLabel}</span>
        					</div>
        					<div class="otd-game-row">
        						<span class="otd-result-badge ${resultClass}">${resultLabel}</span>
        						<span class="otd-matchup">vs. ${opponent}</span>
    ${scoreText ? `<span class="otd-score">${scoreText}</span>` : ''}
        					</div>
        					<div class="otd-date">${dateStr}, ${season}</div>
        				</div>
        			</div>
`;
el.hidden = false;

document.getElementById('otd-refresh')?.addEventListener('click', () => {
 if (pool.length > 1) {
    const next = pool.filter(c => c !== pick)[Math.floor(Math.random() * (pool.length - 1))];
    this._renderOnThisDay(el, next, pool);
}
});
}

computeStreak(completedGames) {
  const sorted = [...completedGames].sort((a, b) => a.date - b.date);
  let lastLoss = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
     if (sorted[i].result === 'LOSS') { lastLoss = sorted[i]; break; }
 }
 let winStreak = 0;
 for (let i = sorted.length - 1; i >= 0; i--) {
     if (sorted[i].result === 'WIN') winStreak++;
     else break;
 }
 const now = new Date();
 const daysSince = lastLoss
 ? Math.floor((now - lastLoss.date) / (1000 * 60 * 60 * 24))
 : null;
 return { winStreak, lastLoss, daysSince };
}

updateStreakBanner(completedGames, isPastSeason) {
  const el = document.getElementById('streak-banner');
  if (!el) return;
  if (completedGames.length === 0) {
     el.hidden = true;
     return;
 }
 const sorted = [...completedGames].sort((a, b) => a.date - b.date);

 if (isPastSeason) {
        			// Opening win streak: wins before the first loss
     let openingStreak = 0;
     let firstLoss = null;
     for (const g of sorted) {
        if (g.result === 'WIN') openingStreak++;
        else { firstLoss = g; break; }
    }
    let html;
    if (!firstLoss) {
        html = `Finished the regular season undefeated &mdash; <strong>${openingStreak}-0</strong>`;
    } else if (openingStreak === 0) {
        html = `Lost the opener &mdash; undefeated for <strong>0 games</strong> to start the season`;
    } else {
        const firstGame = sorted[0];
        const daysToLoss = Math.round((firstLoss.date - firstGame.date) / (1000 * 60 * 60 * 24));
        const gamesText = openingStreak === 1 ? '1 game' : `${openingStreak} games`;
        html = `Undefeated for <strong>${gamesText}</strong> (${daysToLoss} days) to start the season before first loss`;
    }
    el.innerHTML = html;
    el.hidden = false;
} else {
        			// Current season: opening streak + active win streak
 let openingStreak = 0;
 let firstLoss = null;
 for (const g of sorted) {
    if (g.result === 'WIN') openingStreak++;
    else { firstLoss = g; break; }
}
let winStreak = 0;
for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].result === 'WIN') winStreak++;
    else break;
}

let html;
if (!firstLoss) {
    html = `Undefeated to start the season &mdash; <strong>${openingStreak}</strong>-game win streak`;
} else if (openingStreak === 0) {
    const streakText = winStreak === 1 ? '1-game' : `${winStreak}-game`;
    html = `Lost the opener. Currently on a <strong>${streakText}</strong> win streak.`;
} else {
    const firstGame = sorted[0];
    const daysToLoss = Math.round((firstLoss.date - firstGame.date) / (1000 * 60 * 60 * 24));
    const gamesText = openingStreak === 1 ? '1 game' : `${openingStreak} games`;
    const daysText = daysToLoss === 1 ? '1 day' : `${daysToLoss} days`;
    const streakText = winStreak === 1 ? '1-game' : `${winStreak}-game`;
    html = `The Brewers started the season undefeated for <strong>${gamesText}</strong> (${daysText}). Currently on a <strong>${streakText}</strong> win streak.`;
}
el.innerHTML = html;
el.hidden = false;
}
}

updateLastUndefeated(currentSeasonWins, currentSeasonLosses) {
  const el = document.getElementById('last-undefeated');
  if (!el) return;

        		// Check if current season being viewed is itself undefeated (in-progress or final)
  const currentIsUndefeated = currentSeasonLosses === 0 && currentSeasonWins > 0;

        		// Find last undefeated season from CSV records (excluding current if it's live)
  let lastYear = null;
  const csvYears = Object.keys(this.seasonRecords).map(Number).sort((a, b) => a - b);
  for (const yr of csvYears) {
     const r = this.seasonRecords[yr];
     if (parseInt(r.reg_l) === 0 && parseInt(r.reg_w) > 0) {
        lastYear = yr;
    }
}

        		// Also account for ESPN seasons (post-2020): if current season is undefeated and complete, it qualifies
        		// but we want the last historical one to link to, not the current
if (!lastYear) {
 el.innerHTML = '';
 return;
}

const isCurrent = this.currentSeason === lastYear;
const suffix = isCurrent ? '' : `The Brewers were last undefeated in <a href="/${lastYear}" class="last-undefeated-link">${lastYear}</a>.`;

if (currentIsUndefeated && this.currentSeason === this.latestSeason) {
 el.innerHTML = '';
} else if (isCurrent) {
 el.innerHTML = '';
} else {
 el.innerHTML = suffix;
}
}

initGallery() {
  const modal = document.getElementById('photo-gallery-modal');
  const backdrop = modal.querySelector('.gallery-backdrop');
  const closeBtn = document.getElementById('gallery-close');

  backdrop.addEventListener('click', () => this.closeGallery());
  closeBtn.addEventListener('click', () => this.closeGallery());
  document.addEventListener('keydown', (e) => {
     if (!document.getElementById('lightbox').hidden) {
        if (e.key === 'Escape') this.closeLightbox();
        else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
        else if (e.key === 'ArrowRight') this.stepLightbox(1);
    } else if (!modal.hidden) {
        if (e.key === 'Escape') this.closeGallery();
    }
});

  const lightbox = document.getElementById('lightbox');
  document.getElementById('lightbox-close').addEventListener('click', () => this.closeLightbox());
  document.getElementById('lightbox-prev').addEventListener('click', () => this.stepLightbox(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => this.stepLightbox(1));
  lightbox.addEventListener('click', (e) => {
     if (e.target === lightbox || e.target === document.getElementById('lightbox-img')) this.closeLightbox();
 });
}

openLightbox(photo, photos) {
  this._lightboxPhotos = photos;
  this._lightboxIndex = photos.indexOf(photo);
  this._renderLightbox();
  document.getElementById('lightbox').hidden = false;
}

_renderLightbox() {
  const photos = this._lightboxPhotos;
  const idx = this._lightboxIndex;
  const photo = photos[idx];

  document.getElementById('lightbox-img').src = photo.url;
  document.getElementById('lightbox-img').alt = photo.caption;
  document.getElementById('lightbox-caption').textContent = photo.caption;
  const licenseEl = document.getElementById('lightbox-license');
  if (photo.license_url) {
     licenseEl.innerHTML = `License: <a href="${photo.license_url}" target="_blank" rel="noopener noreferrer">${photo.license}</a>`;
 } else {
     licenseEl.textContent = `License: ${photo.license}`;
 }
 document.getElementById('lightbox-prev').classList.toggle('hidden', idx === 0);
 document.getElementById('lightbox-next').classList.toggle('hidden', idx === photos.length - 1);
}

stepLightbox(dir) {
  const next = this._lightboxIndex + dir;
  if (next < 0 || next >= this._lightboxPhotos.length) return;
  this._lightboxIndex = next;
  this._renderLightbox();
}

closeLightbox() {
  document.getElementById('lightbox').hidden = true;
}

openGallery(season) {
  const modal = document.getElementById('photo-gallery-modal');
  const grid = document.getElementById('gallery-grid');
  const title = document.getElementById('gallery-title');
  const photos = this.photosBySeason[season] || [];

  title.textContent = `${season} Season Photos`;
  grid.innerHTML = '';

  photos.forEach(p => {
     const item = document.createElement('div');
     item.className = 'gallery-item';

     const img = document.createElement('img');
     img.src = p.url;
     img.alt = p.caption;
     img.loading = 'lazy';
     img.addEventListener('click', () => this.openLightbox(p, photos));

     const info = document.createElement('div');
     info.className = 'gallery-item-info';

     const caption = document.createElement('p');
     caption.className = 'gallery-caption';
     caption.textContent = p.caption;

     const license = document.createElement('p');
     license.className = 'gallery-license';
     if (p.license_url) {
        license.innerHTML = `License: <a href="${p.license_url}" target="_blank" rel="noopener noreferrer">${p.license}</a>`;
    } else {
        license.textContent = `License: ${p.license}`;
    }

    info.appendChild(caption);
    info.appendChild(license);
    item.appendChild(img);
    item.appendChild(info);
    grid.appendChild(item);
});

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

closeGallery() {
  const modal = document.getElementById('photo-gallery-modal');
  modal.hidden = true;
  document.body.style.overflow = '';
}

showError(message) {
  const answerEl = document.getElementById('answer');
  const recordEl = document.getElementById('record');

  if (answerEl) {
     answerEl.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
     answerEl.className = 'answer error';
 }

 if (recordEl) {
     recordEl.textContent = 'Unable to load data';
 }
}
}

document.addEventListener('DOMContentLoaded', () => {
   new BrewersTracker();
});
