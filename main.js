        import { parseGamesCsv, parseGameinfoCsv, parseCurrentNamesCsv, BREWERS_IDS, computeSeasonHistory, parseTeamstatsLineScores } from './records-core.js';
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
        		this.channelMeta = {};
        		this.providerMeta = {};
        		this.providerAliasIndex = new Map();
        		this.selectedProvider = localStorage.getItem('tvProvider') || null;
        		this.lineScores = null;
        		this.init();
        	}

        	getTvStatus(game) {
        		if (!game) return 'no';
        		const broadcasts = game.competitions?.[0]?.broadcasts || [];
        		if (broadcasts.length === 0) return 'no';
        		// Use our channel_lookup/broadcast_channels metadata to classify each
        		// broadcast: a channel typed broadcast/cable/regional counts as "on TV"
        		// even when ESPN labels it "Streaming" (e.g. Brewers.TV is carried on
        		// DirecTV, Spectrum, Xfinity, etc.). Only fall back to ESPN's type when
        		// the network isn't in our metadata at all.
        		const tvTypes = new Set(['broadcast', 'cable', 'regional']);
        		let hasTV = false;
        		let hasStreaming = false;
        		for (const b of broadcasts) {
        			if (!b.media?.shortName) continue;
        			const ch = this.resolveChannel(b.media.shortName);
        			if (ch) {
        				if (tvTypes.has(ch.type)) { hasTV = true; continue; }
        				if (ch.type === 'streaming') { hasStreaming = true; continue; }
        			}
        			// Unknown to our metadata — trust ESPN's type label.
        			const t = b.type?.shortName || '';
        			if (t === 'TV') hasTV = true;
        			else if (t === 'Streaming') hasStreaming = true;
        		}
        		if (hasTV) return 'yes';
        		if (hasStreaming) return 'streaming';
        		return 'no';
        	}

        	// Choose the broadcast to show next to the game date in the schedule
        	// listing. Prefer TV-type channels (broadcast > cable > regional) over
        	// streaming/radio, since ESPN often lists MLB.TV first even when a
        	// linear TV channel is available. Uses the same channel metadata
        	// classification as getTvStatus.
        	pickPrimaryBroadcast(game) {
        		const broadcasts = game?.competitions?.[0]?.broadcasts || [];
        		if (broadcasts.length === 0) return null;
        		const rank = (b) => {
        			const name = b.media?.shortName;
        			if (!name) return 99;
        			const ch = this.resolveChannel(name);
        			const type = ch?.type || (b.type?.shortName === 'Streaming' ? 'streaming' : b.type?.shortName === 'Radio' ? 'radio' : 'cable');
        			return { broadcast: 0, regional: 1, cable: 2, streaming: 3, radio: 4 }[type] ?? 5;
        		};
        		return broadcasts.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
        	}

        	async init() {
        		try {
        			['streak-details', 'otd-details'].forEach(id => {
        				const details = document.getElementById(id);
        				if (!details) return;
        				const stored = localStorage.getItem(`sectionOpen:${id}`);
        				if (stored !== null) details.open = stored === 'true';
        				details.addEventListener('toggle', () => {
        					localStorage.setItem(`sectionOpen:${id}`, details.open ? 'true' : 'false');
        				});
        			});

        			const [gamesRes, namesRes, photosRes, channelsRes, channelLookupRes, providerLookupRes, teamstatsRes, playersRes] = await Promise.all([
        				fetch('./data/gameinfo.csv'),
        				fetch('./data/CurrentNames.csv'),
        				fetch('./data/photos.csv').catch(() => null),
        				fetch('./data/broadcast_channels.csv'),
        				fetch('./data/channel_lookup.csv'),
        				fetch('./data/provider_lookup.csv'),
        				fetch('./data/teamstats.csv'),
        				fetch('./data/biofile0.csv'),
        			]);
        			if (channelsRes.ok) {
        				const raw = await channelsRes.text();
        				parseGamesCsv(raw).forEach(ch => {
        					this.channelMeta[ch.key] = {
        						...ch,
        						providers: ch.providers ? ch.providers.split('|') : [],
        						sort_order: parseInt(ch.sort_order) || 99,
        					};
        				});
        			}
        			if (channelLookupRes.ok && providerLookupRes.ok) {
        				this._loadTvLookup(await channelLookupRes.text(), await providerLookupRes.text());
        			}
        			if (gamesRes.ok && namesRes.ok) {
        				const teamstatsText = teamstatsRes?.ok ? await teamstatsRes.text() : null;
        				const namesText = await namesRes.text();
        				const games = parseGameinfoCsv(await gamesRes.text(), namesText, teamstatsText);
        				this.teamNames = parseCurrentNamesCsv(namesText);
        				if (playersRes?.ok) {
        					this.playerNames = new Map(
        						parseGamesCsv(await playersRes.text()).map(p => [p.id, `${p.usename} ${p.lastname}`.trim()])
        					);
        				}
        				this.csvBySeason = buildSeasonMap(games);
        				if (teamstatsText) this.lineScores = parseTeamstatsLineScores(teamstatsText);
        				// name -> all-time head-to-head entry, for schedule annotations
        				this.h2hByName = new Map(computeHeadToHead(games).opponents.map(o => [o.name, o]));
        				this.seasonHistory = computeSeasonHistory(games);
        				this.renderHistorySpark();
        				const seasons = Object.keys(this.csvBySeason).map(Number).sort((a, b) => a - b);
        				if (seasons.length) {
        					this.earliestSeason = seasons[0];
        					this.csvMaxSeason = seasons[seasons.length - 1];
        				}
        				// Build season records from games for undefeated-season lookups
        				games.forEach(g => {
        					const yr = parseInt(g.season);
        					if (!this.seasonRecords[yr]) this.seasonRecords[yr] = { season: yr, reg_w: 0, reg_l: 0, reg_t: 0, post_w: 0, post_l: 0, post_t: 0 };
        					const sr = this.seasonRecords[yr];
        					const res = g['Brewers Win'];
        					if (g.regular_season === '1') {
        						if (res === 'WIN') sr.reg_w++; else if (res === 'LOSS') sr.reg_l++; else if (res === 'TIE') sr.reg_t++;
        					} else if (g.playoff === '1') {
        						if (res === 'WIN') sr.post_w++; else if (res === 'LOSS') sr.post_l++; else if (res === 'TIE') sr.post_t++;
        					}
        				});
        			}
        			if (photosRes?.ok) {
        				const raw = await photosRes.text();
        				parseGamesCsv(raw).forEach(p => {
        					const yr = parseInt(p.season);
        					if (!this.photosBySeason[yr]) this.photosBySeason[yr] = [];
        					this.photosBySeason[yr].push(p);
        				});
        			}
        			this.initGallery();
        			this.initWatchModal();
        			this.initProviderModal();
        			this.initLinescoreModal();
        			this.initStandingsModal();
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
          const link = el.querySelector('a');
          if (link) link.textContent = 'Are the Brewers On TV?';
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
          this.renderScheduleProviderBar();
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

_defaultSeason() {
  const now = new Date();
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

async fetchBrewersData(season) {
  const effectiveSeason = season ?? this._defaultSeason();
  if (this.usesCsvData(effectiveSeason)) {
    this.processCsvSeasonData(effectiveSeason);
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
     if (allEvents.length === 0 && this.usesCsvData(effectiveSeason)) {
        this.processCsvSeasonData(effectiveSeason);
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
 if (this.usesCsvData(effectiveSeason)) {
    this.processCsvSeasonData(effectiveSeason);
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

        		// World Series champions only if the Brewers won the series
        		// (more WS game wins than losses), not just a single WS game.
 let wsWins = 0, wsLosses = 0, wsName = '';
 games.forEach(g => {
     if (g.worldseries && g.worldseries.trim() !== '') {
        wsName = `World Series ${g.worldseries.toUpperCase()}`;
        if (g['Brewers Win'] === 'WIN') wsWins++;
        else if (g['Brewers Win'] === 'LOSS') wsLosses++;
    }
});
 const worldSeriesName = wsWins > wsLosses ? wsName : null;

 const isUndefeated = losses === 0 && wins > 0;
 const postRecord = (postWins > 0 || postLosses > 0) ? { w: postWins, l: postLosses, t: postTies } : null;

 this.displayResult(isUndefeated, wins, losses, ties, true, worldSeriesName, postRecord, null);
 this.displayCsvSchedule(games, season);
 this.scrollToGameAnchor();
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
     let section;
     if (isRegular) {
        section = 'regular';
     } else if (isPlayoff) {
        const gt = (g.gametype || '').toUpperCase();
        if (gt === 'W') section = 'ws';
        else if (gt === 'L' || gt === 'C') section = 'lcs';
        else if (gt === 'D') section = 'ds';
        else if (gt === 'F') section = 'wc';
        else section = 'post';
     } else {
        section = 'other';
     }
     const sectionLabels = {
        regular: 'Regular Season',
        wc: 'Wild Card',
        ds: 'Division Series',
        lcs: 'League Championship Series',
        ws: 'World Series',
        post: 'Playoffs',
        other: 'Preseason / Exhibition',
     };

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

scrollToGameAnchor() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#g-')) return;
  const el = document.getElementById(hash.slice(1));
  if (!el) return;
  const grid = document.getElementById('schedule-grid');
  const top = el.offsetTop - (grid.clientHeight / 2) + (el.offsetHeight / 2);
  grid.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 2500);
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

        		if (g.gid) gameItem.id = `g-${g.gid}`;
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

        		if (this.lineScores?.has(g.gid)) {
        			scoreDiv.classList.add('linescore-trigger');
        			scoreDiv.title = 'Click for line score';
        			scoreDiv.addEventListener('click', (e) => {
        				e.stopPropagation();
        				this.openLinescoreModal(g);
        			});
        		}

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

        		// World Series champions only if the Brewers won the series,
        		// not just a single WS game. Tally wins vs losses across all
        		// WS competitions in the schedule.
        		let wsWins = 0, wsLosses = 0, wsName = null;
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
        			wsName = wsName || sbNote.headline;
        			if (brewersScore > opponentScore) wsWins++;
        			else if (brewersScore < opponentScore) wsLosses++;
        		});
        		const worldSeriesName = wsWins > wsLosses ? wsName : null;

        		const isUndefeated = losses === 0 && wins > 0;

        		// Determine TV status for today's game (current season only)
        		let tvStatus = null;
        		let tvGame = null;
        		if (!isPastSeason) {
        			const now = new Date();
        			const liveNow = events.find(e => {
        				const s = e.competitions?.[0]?.status?.type?.name;
        				return s === 'STATUS_IN_PROGRESS' || s === 'STATUS_HALFTIME' ||
        					s === 'STATUS_DELAYED' || s === 'STATUS_BREAK' ||
        					s === 'STATUS_TIMEOUT' || s === 'STATUS_END_PERIOD' || s === 'STATUS_RAIN_DELAY';
        			});
        			const nextScheduled = events
        				.filter(e => new Date(e.date) > now && e.competitions?.[0]?.status?.type?.name === 'STATUS_SCHEDULED')
        				.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        			tvGame = liveNow || nextScheduled;
        			tvStatus = this.getTvStatus(tvGame);
        		}

        		this.displayResult(isUndefeated, wins, losses, ties, isPastSeason, worldSeriesName, postRecord, preRecord, tvStatus, tvGame);
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

        		this._lastResult = null;
        		this._isOffseason = true;
        		answerEl.innerHTML = `OFFSEASON`;
        		answerEl.className = 'answer offseason';
        		document.body.classList.remove('undefeated');
        		document.body.classList.add('offseason');

        		recordEl.textContent = 'The season hasn\'t started yet!';
        	}

        	emojiRowHtml(emoji, count) {
        		if (count <= 0) return '';
        		const spans = Array.from({ length: count }, () => `<span>${emoji}</span>`).join('');
        		return `<div class="emoji-row">${spans}</div>`;
        	}

        	displayResult(isUndefeated, wins, losses, ties, isPastSeason = false, worldSeriesName = null, postRecord = null, preRecord = null, tvStatus = null, tvGame = null) {
        		const answerEl = document.getElementById('answer');
        		const recordEl = document.getElementById('record');

        		this._lastResult = { isUndefeated, wins, losses, ties, isPastSeason, worldSeriesName, postRecord, preRecord, tvStatus };
        		this._isOffseason = false;

        		if (worldSeriesName) {
        			answerEl.innerHTML = `🏆🍺<br>${worldSeriesName.toUpperCase()}<br>CHAMPIONS!<br>🎉`;
        			answerEl.className = 'answer champions';
        			document.body.classList.remove('undefeated');
        		} else if (!isPastSeason && tvStatus !== null) {
        			// Current season: answer based on whether today's game is on TV.
        			// The badge is clickable when we have broadcast data for the
        			// game it refers to, opening the same Where-to-watch modal the
        			// schedule's watch button uses.
        			const hasBroadcasts = tvGame && (tvGame.competitions?.[0]?.broadcasts || []).some(b => b.media?.shortName);
        			if (tvStatus === 'yes') {
        				answerEl.innerHTML = `YES!!!`;
        				answerEl.className = 'answer yes';
        				document.body.classList.add('undefeated');
        			} else if (tvStatus === 'streaming') {
        				answerEl.innerHTML = `STREAMING ONLY`;
        				answerEl.className = 'answer streaming';
        				document.body.classList.remove('undefeated');
        			} else {
        				answerEl.innerHTML = `NO`;
        				answerEl.className = 'answer no';
        				document.body.classList.remove('undefeated');
        			}
        			if (hasBroadcasts) {
        				answerEl.style.cursor = 'pointer';
        				answerEl.title = 'Click to see where to watch';
        				answerEl.onclick = () => this.openWatchModal(tvGame);
        			} else {
        				answerEl.style.cursor = '';
        				answerEl.title = '';
        				answerEl.onclick = null;
        			}
        		} else if (isUndefeated) {
        			const beerHtml = !isPastSeason ? this.emojiRowHtml('🍺', 1) : '';
        			answerEl.innerHTML = `YES!!!${beerHtml}`;
        			answerEl.className = 'answer yes';
        			document.body.classList.add('undefeated');
        		} else if (isPastSeason) {
        			// Past seasons: show no YES/NO/streaming answer, just the record.
        			answerEl.innerHTML = '';
        			answerEl.className = 'answer past';
        			document.body.classList.remove('undefeated');
        		} else {
        			const beerHtml = this.emojiRowHtml('🍺', 1);
        			answerEl.innerHTML = `NO${beerHtml}`;
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
             if (!isPastSeason) {
               html += `<span class="record-standings-link" title="Click to view standings">${regularText}</span>`;
             } else {
               html += regularText;
             }
             if (postText) html += `<br><span class="playoff-record">${postText}</span>`;
             recordEl.innerHTML = html;
             if (!isPastSeason) {
               const link = recordEl.querySelector('.record-standings-link');
               if (link) link.addEventListener('click', () => this.openStandingsModal());
             }
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

          // Cache so the schedule can be re-rendered when the selected TV
          // provider changes (channel numbers depend on the provider).
          this._lastScheduleEvents = sortedEvents;
          this._lastIsPastSeason = isPastSeason;

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
  const targetEvent = sortedEvents[mostRecentCompletedIndex];
  const gameItem = scheduleGrid.querySelector(`[data-event-id="${targetEvent.id}"]`);
  if (gameItem) {
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
  gameItem.dataset.eventId = event.id;

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

const primaryBroadcast = this.pickPrimaryBroadcast(event) || {};
const network = primaryBroadcast.media?.shortName || '';
const channelNum = this.scheduleChannelNumber(primaryBroadcast);
const hasBroadcasts = (competition?.broadcasts || []).some(b => b.media?.shortName);
const gameIsCompleted = status.type.name === 'STATUS_FINAL';
const canWatch = hasBroadcasts && !gameIsCompleted && this.currentSeason === this.latestSeason;

gameDetails.appendChild(opponentDiv);

// All-time head-to-head sits right below the opponent.
if (this.currentSeason === this.latestSeason) {
 const h2h = this.h2hNote(opponent);
 if (h2h) gameDetails.appendChild(h2h);
}

const dateDiv = document.createElement('div');
dateDiv.className = 'game-date';
if (isLive || isInProgress) {
 dateDiv.innerHTML = `<span class="live-indicator-small"></span>LIVE NOW`;
} else {
 dateDiv.textContent = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});
}
gameDetails.appendChild(dateDiv);

// Channel/network on its own line below the date. Clickable to open the
// "Where to watch" modal when full broadcast data is available.
if (network || canWatch) {
 const channelLine = document.createElement('div');
 channelLine.className = 'game-channel';
 let html = '';
 if (isLive || isInProgress) html += `<span class="live-indicator-small"></span>`;
 if (network) {
   html += `<span class="game-network">${network}${channelNum ? ` <span class="game-channum">Ch. ${channelNum}</span>` : ''}</span>`;
 }
 if (canWatch && !network) {
   html += `<i class="mdi mdi-television-play"></i> Where to watch`;
 }
 channelLine.innerHTML = html;
 if (canWatch) {
   channelLine.classList.add('game-channel-watchable');
   channelLine.title = 'Click for where to watch';
   channelLine.addEventListener('click', (e) => {
     e.stopPropagation();
     this.openWatchModal(event);
   });
 }
 gameDetails.appendChild(channelLine);
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

const hasLinescore = (competition.linescores && competition.linescores.length > 0) ||
  competitors.some(c => c.linescores && c.linescores.length > 0);

if (hasLinescore) {
  scoreDiv.classList.add('linescore-trigger');
  scoreDiv.title = 'Click for line score';
  scoreDiv.textContent = `${resultIndicator}${brewersScore}-${opponentScore}`;
  scoreDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    this.openLinescoreFromEvent(event);
  });
} else {
  scoreDiv.classList.add('linescore-trigger');
  scoreDiv.title = 'Click for line score';
  scoreDiv.textContent = `${resultIndicator}${brewersScore}-${opponentScore}`;
  scoreDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    this.openLinescoreFromEvent(event);
  });
}
scoreDiv.style.textAlign = 'center';
scoreDiv.style.marginTop = '0.5rem';
scoreDiv.style.width = '100%';
gameItem.appendChild(scoreDiv);
} else if (isLive || isInProgress) {
 const scoreDiv = document.createElement('div');
 scoreDiv.className = 'game-score live linescore-trigger';
 scoreDiv.title = 'Click for line score';
 scoreDiv.textContent = `${brewersScore}-${opponentScore}`;
 scoreDiv.addEventListener('click', (e) => {
   e.stopPropagation();
   this.openLinescoreFromEvent(event);
 });
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

resolveChannel(networkName) {
  if (!networkName) return null;
  const key = networkName.trim();
  // exact match first
  if (this.channelMeta[key]) return this.channelMeta[key];
  // case-insensitive
  const lower = key.toLowerCase();
  for (const [k, ch] of Object.entries(this.channelMeta)) {
    if (k.toLowerCase() === lower) return ch;
  }
  return null;
}

_loadTvLookup(channelLookupRaw, providerLookupRaw) {
  const channels = parseGamesCsv(channelLookupRaw);
  const providers = parseGamesCsv(providerLookupRaw);

  // provider key -> metadata + channel map (key -> channel number string)
  this.providerMeta = {};
  this.providerAliasIndex = new Map();
  for (const p of providers) {
    const key = p.provider;
    this.providerMeta[key] = {
      key,
      display_name: p.display_name,
      alternate_name: p.alternate_name || '',
      website_url: p.website_url || '',
      channel_lineup: p.channel_lineup || '',
      service_areas: (p.service_areas || '')
        .split('|').map(s => s.trim()).filter(Boolean),
      channels: {},
    };
    // index display name + each comma-separated alternate name
    const names = [p.display_name, ...(p.alternate_name || '').split(',').map(s => s.trim()).filter(Boolean)];
    for (const n of names) {
      this.providerAliasIndex.set(n.toLowerCase(), key);
    }
  }

  // channel_lookup carries the canonical website_url + description; override
  // the broadcast_channels entries, which can drift to dead pages.
  // When broadcast_channels.csv is unavailable (404), channelMeta is empty —
  // seed it from channel_lookup so resolveChannel still classifies channels
  // by type (e.g. Brewers.TV as 'regional', not ESPN's 'Streaming' label).
  for (const ch of channels) {
    const key = ch.key;
    if (!key || this.channelMeta[key]) continue;
    this.channelMeta[key] = {
      key,
      display_name: ch.display_name || key,
      type: ch.type || 'cable',
      providers: [],
      description: (ch.description || '').trim() || null,
      website_url: (ch.website_url || '').trim() || null,
      sort_order: 99,
    };
    if (ch.alias && !this.channelMeta[ch.alias]) {
      this.channelMeta[ch.alias] = this.channelMeta[key];
    }
  }
  const urlByKey = {};
  const urlByDisplay = {};
  for (const ch of channels) {
    const url = (ch.website_url || '').trim();
    const desc = (ch.description || '').trim();
    if (!url && !desc) continue;
    const entry = { website_url: url || null, description: desc || null };
    urlByKey[ch.key] = entry;
    if (ch.alias) urlByKey[ch.alias] = entry;
    if (ch.display_name) urlByDisplay[ch.display_name] = entry;
  }
  for (const [key, meta] of Object.entries(this.channelMeta)) {
    const hit = urlByKey[key] || urlByDisplay[meta.display_name];
    if (!hit) continue;
    if (hit.website_url) meta.website_url = hit.website_url;
    if (hit.description) meta.description = hit.description;
  }

  // channel_lookup columns: key,alias,display_name,type,...<provider keys>
  const providerKeys = Object.keys(this.providerMeta);
  for (const ch of channels) {
    const channelKey = ch.key;
    const alias = ch.alias || '';
    for (const pk of providerKeys) {
      const v = (ch[pk] || '').trim();
      if (v && v.toLowerCase() !== 'varies by market') {
        // Map both the primary key and alias so both resolve to the same channel.
        this.providerMeta[pk].channels[channelKey] = v;
        if (alias) this.providerMeta[pk].channels[alias] = v;
      }
    }
  }
}

resolveProviderByName(query) {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // exact alias match
  const hit = this.providerAliasIndex.get(q);
  if (hit) return this.providerMeta[hit];
  // partial match (starts-with then includes)
  for (const [alias, key] of this.providerAliasIndex) {
    if (alias.startsWith(q)) return this.providerMeta[key];
  }
  for (const [alias, key] of this.providerAliasIndex) {
    if (alias.includes(q)) return this.providerMeta[key];
  }
  return null;
}

resolveProviderChannel(providerKey, networkName, areaIndex) {
  if (!providerKey || !networkName) return null;
  const p = this.providerMeta[providerKey];
  if (!p) return null;
  const key = networkName.trim();
  let raw = p.channels[key];
  if (!raw) {
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(p.channels)) {
      if (k.toLowerCase() === lower) { raw = v; break; }
    }
  }
  if (!raw) return null;
  // If the provider has service areas and the channel cell has per-area
  // values separated by " | ", pick the one for the selected area. A cell
  // with no separator is the general listing and is used as-is.
  if (Array.isArray(p.service_areas) && p.service_areas.length > 1 && raw.includes('|')) {
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const idx = (typeof areaIndex === 'number' && areaIndex >= 0 && areaIndex < parts.length) ? areaIndex : 0;
      return parts[idx] || parts[0] || raw;
    }
  }
  return raw;
}

selectedServiceAreaIndex(providerKey) {
  if (!providerKey) return 0;
  const idx = parseInt(localStorage.getItem(`tvServiceArea.${providerKey}`), 10);
  return Number.isInteger(idx) && idx >= 0 ? idx : 0;
}

setServiceAreaIndex(providerKey, idx) {
  if (!providerKey) return;
  localStorage.setItem(`tvServiceArea.${providerKey}`, String(idx));
}

// Channel number to show inline in the schedule for a broadcast, based on
// the viewer's selected provider. Returns null when no provider is set, the
// broadcast isn't on linear TV, or the channel isn't in the provider's lineup.
scheduleChannelNumber(broadcast) {
  if (!broadcast?.media?.shortName) return null;
  if (!this.selectedProvider || !this.providerMeta[this.selectedProvider]) return null;
  const ch = this.resolveChannel(broadcast.media.shortName);
  // Only show channel numbers for linear TV (broadcast/cable/regional) —
  // never streaming or radio.
  const type = ch?.type;
  if (type !== 'broadcast' && type !== 'cable' && type !== 'regional') return null;
  const name = ch?.key || broadcast.media.shortName;
  return this.resolveProviderChannel(this.selectedProvider, name, this.selectedServiceAreaIndex(this.selectedProvider));
}

_rerenderSchedule() {
  if (this._lastScheduleEvents) {
    this.displaySchedule(this._lastScheduleEvents, this._lastIsPastSeason);
  }
}

providerOptions() {
  return Object.values(this.providerMeta)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

initWatchModal() {
  const modal = document.getElementById('watch-modal');
  const backdrop = modal.querySelector('.watch-backdrop');
  const closeBtn = document.getElementById('watch-close');
  backdrop.addEventListener('click', () => this.closeWatchModal());
  closeBtn.addEventListener('click', () => this.closeWatchModal());
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') this.closeWatchModal();
  });
}

// Shared provider search input (used by the watch modal and the schedule bar).
// Owns the selectedProvider/localStorage state; calls onChange(match) after
// every apply so each caller can refresh its own dependents.
_buildProviderInput({ label, inputId, listId, placeholder, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'watch-provider-picker';

  if (label) {
    const lbl = document.createElement('label');
    lbl.className = 'watch-provider-label';
    lbl.htmlFor = inputId;
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  const inputWrap = document.createElement('div');
  inputWrap.className = 'watch-provider-input-wrap';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = inputId;
  input.className = 'watch-provider-input';
  input.placeholder = placeholder;
  input.setAttribute('list', listId);
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (this.selectedProvider && this.providerMeta[this.selectedProvider]) {
    input.value = this.providerMeta[this.selectedProvider].display_name;
  }
  inputWrap.appendChild(input);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'watch-provider-clear';
  clearBtn.setAttribute('aria-label', 'Clear provider');
  clearBtn.innerHTML = '<i class="mdi mdi-close"></i>';
  clearBtn.hidden = !input.value;
  inputWrap.appendChild(clearBtn);

  const list = document.createElement('datalist');
  list.id = listId;
  this.providerOptions().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.display_name;
    list.appendChild(opt);
  });
  inputWrap.appendChild(list);

  wrap.appendChild(inputWrap);

  const hint = document.createElement('div');
  hint.className = 'watch-provider-hint';
  hint.hidden = true;
  wrap.appendChild(hint);

  // Service-area picker — only shown when the selected provider splits its
  // channel lineup across multiple service areas.
  const areaSelectId = inputId + '-service-area';
  const areaWrap = document.createElement('div');
  areaWrap.className = 'watch-service-area-picker';
  areaWrap.hidden = true;

  const areaLabel = document.createElement('label');
  areaLabel.className = 'watch-service-area-label';
  areaLabel.htmlFor = areaSelectId;
  areaLabel.textContent = 'Service area';
  areaWrap.appendChild(areaLabel);

  const areaSelect = document.createElement('select');
  areaSelect.id = areaSelectId;
  areaSelect.className = 'watch-service-area-select';
  areaWrap.appendChild(areaSelect);

  wrap.appendChild(areaWrap);

  const refreshArea = (match) => {
    const areas = match && Array.isArray(match.service_areas) ? match.service_areas : [];
    areaSelect.innerHTML = '';
    if (areas.length > 1) {
      areas.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = name;
        areaSelect.appendChild(opt);
      });
      const saved = this.selectedServiceAreaIndex(match.key);
      areaSelect.selectedIndex = Math.min(saved, areas.length - 1);
      areaWrap.hidden = false;
    } else {
      areaWrap.hidden = true;
    }
  };

  areaSelect.addEventListener('change', () => {
    const key = this.selectedProvider;
    if (key) this.setServiceAreaIndex(key, areaSelect.selectedIndex);
    onChange(key && this.providerMeta[key] ? this.providerMeta[key] : null);
  });

  refreshArea(this.selectedProvider && this.providerMeta[this.selectedProvider]
    ? this.providerMeta[this.selectedProvider] : null);

  const applyMatch = (match, { persistInput = true } = {}) => {
    if (match) {
      this.selectedProvider = match.key;
      localStorage.setItem('tvProvider', match.key);
      if (persistInput) input.value = match.display_name;
      hint.hidden = true;
    } else {
      this.selectedProvider = null;
      localStorage.removeItem('tvProvider');
      hint.hidden = !input.value.trim();
      hint.textContent = input.value.trim() ? `No provider matching "${input.value.trim()}".` : '';
    }
    clearBtn.hidden = !input.value;
    refreshArea(match);
    onChange(match);
  };

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    const v = input.value.trim();
    if (!v) {
      applyMatch(null);
      return;
    }
    const exact = this.providerAliasIndex.get(v.toLowerCase());
    if (exact) {
      applyMatch(this.providerMeta[exact]);
    } else {
      hint.hidden = true;
    }
  });

  input.addEventListener('change', () => {
    const match = this.resolveProviderByName(input.value);
    applyMatch(match, { persistInput: !!match });
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    applyMatch(null);
    input.focus();
  });

  return wrap;
}

_renderProviderPicker(channelsEl) {
  channelsEl.innerHTML = '';
  channelsEl.appendChild(this._buildProviderInput({
    label: 'Your TV provider',
    inputId: 'watch-provider-input',
    listId: 'watch-provider-list',
    placeholder: 'Search providers (e.g. Xfinity, Spectrum, TDS)…',
    onChange: () => {
      this._renderWatchChannels(channelsEl, channelsEl._resolved, channelsEl._radioResolved);
      this._rerenderSchedule();
      this._refreshScheduleProviderDisplay();
    },
  }));
}

// Compact bar under the schedule showing the selected TV provider with a
// button that opens a modal to change it. Hidden for historical (CSV-only)
// seasons, which have no broadcast data.
renderScheduleProviderBar() {
  const bar = document.getElementById('schedule-provider-bar');
  if (!bar) return;
  const hasProviders = this.providerMeta && Object.keys(this.providerMeta).length > 0;
  const isCsvSeason = this.usesCsvData(this.currentSeason);
  bar.hidden = !hasProviders || isCsvSeason;
  if (bar.hidden) return;

  bar.innerHTML = '';

  const current = this.selectedProvider && this.providerMeta[this.selectedProvider]
    ? this.providerMeta[this.selectedProvider].display_name : null;

  const display = document.createElement('div');
  display.className = 'schedule-provider-display';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'schedule-provider-label';
  labelSpan.textContent = 'TV provider';
  display.appendChild(labelSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'schedule-provider-name';
  if (current) {
    nameSpan.textContent = current;
  } else {
    nameSpan.classList.add('schedule-provider-none');
    nameSpan.textContent = 'Not selected';
  }
  display.appendChild(nameSpan);

  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'schedule-provider-change';
  changeBtn.innerHTML = current
    ? '<i class="mdi mdi-pencil"></i> Change'
    : '<i class="mdi mdi-magnify"></i> Choose';
  changeBtn.addEventListener('click', () => this.openProviderModal());
  display.appendChild(changeBtn);

  bar.appendChild(display);
}

initProviderModal() {
  const modal = document.getElementById('provider-modal');
  if (!modal) return;
  const backdrop = modal.querySelector('.provider-backdrop');
  const closeBtn = document.getElementById('provider-close');
  backdrop.addEventListener('click', () => this.closeProviderModal());
  closeBtn.addEventListener('click', () => this.closeProviderModal());
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') this.closeProviderModal();
  });
}

openProviderModal() {
  const modal = document.getElementById('provider-modal');
  if (!modal) return;
  const container = document.getElementById('provider-picker-container');
  container.innerHTML = '';
  container.appendChild(this._buildProviderInput({
    label: 'Your TV provider',
    inputId: 'schedule-provider-input',
    listId: 'schedule-provider-list',
    placeholder: 'Search providers (e.g. Xfinity, Spectrum, TDS)…',
    onChange: () => {
      this._rerenderSchedule();
      const watchEl = document.getElementById('watch-channels');
      if (watchEl && watchEl._resolved) {
        this._renderWatchChannels(watchEl, watchEl._resolved, watchEl._radioResolved);
      }
      this._refreshScheduleProviderDisplay();
    },
  }));
  modal.hidden = false;
  const inp = container.querySelector('input');
  if (inp) { inp.focus(); inp.select(); }
}

closeProviderModal() {
  const modal = document.getElementById('provider-modal');
  if (modal) modal.hidden = true;
}

// Update just the name/button text in the schedule bar without rebuilding it
// (used when the provider changes from elsewhere, e.g. the watch modal).
_refreshScheduleProviderDisplay() {
  const bar = document.getElementById('schedule-provider-bar');
  if (!bar || bar.hidden) return;
  const nameSpan = bar.querySelector('.schedule-provider-name');
  const changeBtn = bar.querySelector('.schedule-provider-change');
  if (!nameSpan || !changeBtn) return;
  const current = this.selectedProvider && this.providerMeta[this.selectedProvider]
    ? this.providerMeta[this.selectedProvider].display_name : null;
  if (current) {
    nameSpan.textContent = current;
    nameSpan.classList.remove('schedule-provider-none');
    changeBtn.innerHTML = '<i class="mdi mdi-pencil"></i> Change';
  } else {
    nameSpan.textContent = 'Not selected';
    nameSpan.classList.add('schedule-provider-none');
    changeBtn.innerHTML = '<i class="mdi mdi-magnify"></i> Choose provider';
  }
}

_renderWatchChannels(channelsEl, resolved, radioResolved) {
  // Remove previously rendered channel sections (keep the picker).
  [...channelsEl.querySelectorAll('.watch-channel-section')].forEach(el => el.remove());

  if ((!resolved || resolved.length === 0) && (!radioResolved || radioResolved.length === 0)) {
    const empty = document.createElement('p');
  empty.className = 'watch-no-data watch-channel-section';
  empty.textContent = 'No broadcast information available for this game.';
  channelsEl.appendChild(empty);
  return;
  }

  const typeOrder = ['broadcast', 'cable', 'regional', 'streaming', 'radio'];
  const typeLabels = { broadcast: 'On TV — Broadcast', cable: 'On TV — Cable', regional: 'Regional TV', streaming: 'Streaming', radio: 'Radio' };
  const groups = {};
  resolved.forEach(ch => {
    const t = typeOrder.includes(ch.type) ? ch.type : 'cable';
    if (!groups[t]) groups[t] = [];
    groups[t].push(ch);
  });
  (radioResolved || []).forEach(ch => {
    if (!groups['radio']) groups['radio'] = [];
    groups['radio'].push(ch);
  });

  const provider = this.selectedProvider && this.providerMeta[this.selectedProvider] ? this.providerMeta[this.selectedProvider] : null;
  const showChannelNum = Boolean(provider);
  // Only show channel numbers for broadcast/cable/regional — never streaming or radio.
  const numTypes = new Set(['broadcast', 'cable', 'regional']);

  typeOrder.forEach(type => {
    if (!groups[type]) return;
    const section = document.createElement('div');
    section.className = 'watch-channel-section';

    const label = document.createElement('div');
    label.className = 'watch-group-label';
    label.textContent = typeLabels[type];
    section.appendChild(label);

    const list = document.createElement('div');
    list.className = 'watch-channel-list';

    groups[type].forEach(ch => {
      const item = document.createElement('div');
      item.className = 'watch-channel-item';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'watch-channel-name';
      if (ch.website_url) {
        nameDiv.innerHTML = `<a href="${ch.website_url}" target="_blank" rel="noopener noreferrer">${ch.display_name}</a>`;
      } else {
        nameDiv.textContent = ch.display_name;
      }
      item.appendChild(nameDiv);

      if (ch.description) {
        const desc = document.createElement('div');
        desc.className = 'watch-channel-desc';
        desc.textContent = ch.description;
        item.appendChild(desc);
      }

      if (showChannelNum && numTypes.has(type)) {
        const num = this.resolveProviderChannel(provider.key, ch.key, this.selectedServiceAreaIndex(provider.key));
        const numDiv = document.createElement('div');
        numDiv.className = 'watch-channel-num';
        if (num) {
          numDiv.innerHTML = `<span class="watch-channel-num-label">${provider.display_name}</span> <span class="watch-channel-num-value">Ch. ${num}</span>`;
        } else {
          numDiv.innerHTML = `<span class="watch-channel-num-label watch-channel-num-none">Not listed for ${provider.display_name}</span>`;
        }
        item.appendChild(numDiv);
      }

      const providers = Array.isArray(ch.providers) ? ch.providers : [];
      // Merge in local providers from our lookup that carry this channel
      const localProviders = [];
      for (const pk of Object.keys(this.providerMeta)) {
        const p = this.providerMeta[pk];
        if (p.channels && p.channels[ch.key]) {
          localProviders.push(p.display_name);
        }
      }
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const seenProviders = new Set();
      const merged = [];
      for (const name of [...providers, ...localProviders]) {
        const k = norm(name);
        if (!seenProviders.has(k)) { seenProviders.add(k); merged.push(name); }
      }
      if (merged.length > 0) {
        const pDiv = document.createElement('div');
        pDiv.className = 'watch-providers';
        pDiv.textContent = 'Available on: ' + merged.join(', ');
        item.appendChild(pDiv);
      }

      list.appendChild(item);
    });

    section.appendChild(list);
    channelsEl.appendChild(section);
  });
}

async openWatchModal(event) {
  const modal = document.getElementById('watch-modal');
  const gameInfoEl = document.getElementById('watch-game-info');
  const channelsEl = document.getElementById('watch-channels');

  channelsEl.innerHTML = '<p class="watch-no-data">Loading channels…</p>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // Game info line
  const competition = event.competitions?.[0];
  const date = new Date(event.date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const competitors = competition?.competitors || [];
  let opponent = '';
  let isHome = false;
  competitors.forEach(c => {
    if (c.team.abbreviation === 'MIL') isHome = c.homeAway === 'home';
    else opponent = c.team.displayName;
  });
  gameInfoEl.textContent = `${isHome ? 'vs' : '@'} ${opponent} · ${dateStr}`;

  // Extract broadcasts from the ESPN event we already have.
  // Each broadcast: { type: { shortName: 'TV'|'Streaming'|'Radio' },
  //                   market: { type: 'National'|'Home'|'Away' },
  //                   media: { shortName: 'FOX' } }
  const raw = (competition?.broadcasts || []).filter(b => b.media?.shortName);
  const tv = raw.filter(b => (b.type?.shortName || '') === 'TV');
  const streaming = raw.filter(b => (b.type?.shortName || '') === 'Streaming');
  const radio = raw.filter(b => (b.type?.shortName || '') === 'Radio');

  // Resolve each to our channel metadata; dedupe by display name + type.
  const resolve = (list) => {
    const seen = new Set();
    const out = [];
    for (const b of list) {
      const name = b.media.shortName;
      const ch = this.resolveChannel(name) || {
        key: name, display_name: name,
        type: b.type?.shortName === 'Streaming' ? 'streaming'
          : b.type?.shortName === 'Radio' ? 'radio' : 'cable',
        providers: [], description: null, website_url: null,
      };
      const sig = ch.display_name + '|' + ch.type;
      if (!seen.has(sig)) { seen.add(sig); out.push(ch); }
    }
    return out;
  };

  const resolved = [...resolve(tv), ...resolve(streaming)];
  const radioResolved = resolve(radio);

  // Picker (session-persistent provider) + channel sections.
  this._renderProviderPicker(channelsEl);
  channelsEl._resolved = resolved;
  channelsEl._radioResolved = radioResolved;
  this._renderWatchChannels(channelsEl, resolved, radioResolved);
}

closeWatchModal() {
  document.getElementById('watch-modal').hidden = true;
  document.body.style.overflow = '';
}

initLinescoreModal() {
  const modal = document.getElementById('linescore-modal');
  modal.querySelector('.linescore-backdrop').addEventListener('click', () => this.closeLinescoreModal());
  document.getElementById('linescore-close').addEventListener('click', () => this.closeLinescoreModal());
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') this.closeLinescoreModal();
  });
}

initStandingsModal() {
  const modal = document.getElementById('standings-modal');
  modal.querySelector('.standings-backdrop').addEventListener('click', () => this.closeStandingsModal());
  document.getElementById('standings-close').addEventListener('click', () => this.closeStandingsModal());
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') this.closeStandingsModal();
  });
}

async openStandingsModal() {
  const modal = document.getElementById('standings-modal');
  const body = document.getElementById('standings-body');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="loading">Loading standings...</div>';

  try {
    const [alData, nlData] = await Promise.all([
      fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?group=7').then(r => r.json()),
      fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?group=8').then(r => r.json()),
    ]);
    this._standingsData = { alData, nlData };
    body.innerHTML = this._buildStandingsShell();
    this._wireStandingsTabs(body);
    this._showStandingsTab(body, 'division');
  } catch {
    body.innerHTML = '<p class="record-empty">Could not load standings.</p>';
  }
}

_buildStandingsShell() {
  return `
    <div class="standings-tabs" role="tablist">
      <button class="standings-tab" data-tab="division" role="tab">Division</button>
      <button class="standings-tab" data-tab="league" role="tab">League</button>
      <button class="standings-tab" data-tab="mlb" role="tab">MLB</button>
      <button class="standings-tab" data-tab="pennant" role="tab">Wild Card</button>
    </div>
    <div class="standings-panel"></div>`;
}

_wireStandingsTabs(body) {
  body.querySelectorAll('.standings-tab').forEach(btn => {
    btn.addEventListener('click', () => this._showStandingsTab(body, btn.dataset.tab));
  });
}

_showStandingsTab(body, tab) {
  body.querySelectorAll('.standings-tab').forEach(b => b.classList.toggle('standings-tab-active', b.dataset.tab === tab));
  const panel = body.querySelector('.standings-panel');
  panel.innerHTML = this._renderStandingsTab(tab);
}

_parseDivisions(data) {
  return (data.children || []).map(div => ({
    name: div.name,
    short: div.name.replace('American League ', 'AL ').replace('National League ', 'NL '),
    isNlCentral: div.name === 'National League Central',
    entries: div.standings?.entries || [],
  }));
}

_stat(entry, abbr) {
  const s = (entry.stats || []).find(st => st.abbreviation === abbr || st.name === abbr);
  return s?.displayValue ?? '—';
}

_parsePct(entry) {
  const raw = this._stat(entry, 'PCT');
  return parseFloat(raw.startsWith('.') ? '0' + raw : raw) || 0;
}

_divisionTableHtml(div, showDivName, cols, playoffTags) {
  const defaultCols = ['W','L','PCT','GB','STRK','Last Ten'];
  const activeCols = cols || defaultCols;
  const colLabels = { W:'W', L:'L', PCT:'PCT', GB:'GB', STRK:'Streak', 'Last Ten':'L10', Home:'Home', AWAY:'Away', DIFF:'Run Diff', MNW:'WC#' };

  const headers = activeCols.map(c => `<th class="standings-num">${colLabels[c] ?? c}</th>`).join('');
  const rows = div.entries.map((entry) => {
    const abbr = entry.team?.abbreviation || '';
    const isMil = abbr === 'MIL';
    const name = entry.team?.shortDisplayName || entry.team?.displayName || abbr;
    const cells = activeCols.map(c => `<td class="standings-num">${this._stat(entry, c)}</td>`).join('');
    const tag = playoffTags?.[entry.team?.id];
    const tagHtml = tag === 'div' ? ' <span class="standings-tag standings-tag-div">DIV</span>'
                  : tag === 'wc'  ? ' <span class="standings-tag standings-tag-wc">WC</span>'
                  : '';
    return `<tr class="${isMil ? 'standings-brewers' : ''}">
      <td class="standings-team-cell">${name}${tagHtml}</td>${cells}
    </tr>`;
  }).join('');

  const header = showDivName ? `<div class="standings-div-label">${div.short}</div>` : '';
  return `<div class="standings-block">${header}
    <div class="standings-scroll">
      <table class="standings-table">
        <thead><tr><th class="standings-team-cell">Team</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

_renderStandingsTab(tab) {
  const { alData, nlData } = this._standingsData;
  const alDivs = this._parseDivisions(alData);
  const nlDivs = this._parseDivisions(nlData);

  const divOrder = [
    'American League East','American League Central','American League West',
    'National League East','National League Central','National League West',
  ];
  const sortDivs = (arr) => arr.slice().sort((a,b) => divOrder.indexOf(a.name) - divOrder.indexOf(b.name));

  if (tab === 'division') {
    const alSorted = sortDivs(alDivs);
    const nlSorted = sortDivs(nlDivs);
    return `
      <div class="standings-league-section">
        <div class="standings-league-label">National League</div>
        ${nlSorted.map(d => this._divisionTableHtml(d, true, ['W','L','PCT','GB','STRK','Last Ten'])).join('')}
      </div>
      <div class="standings-league-section">
        <div class="standings-league-label">American League</div>
        ${alSorted.map(d => this._divisionTableHtml(d, true, ['W','L','PCT','GB','STRK','Last Ten'])).join('')}
      </div>`;
  }

  if (tab === 'league') {
    const sortByPct = (entries) => entries.slice().sort((a, b) => this._parsePct(b) - this._parsePct(a));
    const alEntries = sortByPct(alDivs.flatMap(d => d.entries));
    const nlEntries = sortByPct(nlDivs.flatMap(d => d.entries));
    const alDiv = { short: 'American League', entries: alEntries };
    const nlDiv = { short: 'National League', entries: nlEntries };
    return `
      <div class="standings-league-section">
        ${this._divisionTableHtml(nlDiv, true, ['W','L','PCT','GB','STRK','Last Ten'])}
      </div>
      <div class="standings-league-section">
        ${this._divisionTableHtml(alDiv, true, ['W','L','PCT','GB','STRK','Last Ten'])}
      </div>`;
  }

  if (tab === 'mlb') {
    const allEntries = [...nlDivs, ...alDivs].flatMap(d => d.entries);
    allEntries.sort((a, b) => this._parsePct(b) - this._parsePct(a));
    const fakeSingleDiv = { short: '', entries: allEntries };
    return this._divisionTableHtml(fakeSingleDiv, false, ['W','L','PCT','GB','STRK','Last Ten','Home','AWAY']);
  }

  if (tab === 'pennant') {
    // 6 playoff spots per league: 3 division winners + 3 wild card spots.
    // No cutoff line — a division winner can sit below a wild card team in
    // overall winning percentage, so a divider would be misleading.
    const wcTagged = (divs) => {
      const divWinnerIds = new Set(divs.map(d => d.entries[0]?.team?.id).filter(Boolean));
      const all = divs.flatMap(d => d.entries).slice().sort((a, b) => this._parsePct(b) - this._parsePct(a));
      const tags = {};
      let wcSlots = 0;
      const seenDivWinners = new Set();
      for (let i = 0; i < all.length; i++) {
        const id = all[i].team?.id;
        if (divWinnerIds.has(id) && !seenDivWinners.has(id)) {
          seenDivWinners.add(id);
          tags[id] = 'div';
        } else if (!divWinnerIds.has(id) && wcSlots < 3) {
          tags[id] = 'wc';
          wcSlots++;
        }
      }
      return { entries: all, tags };
    };
    const nl = wcTagged(nlDivs);
    const al = wcTagged(alDivs);
    const nlDiv = { short: 'NL Wild Card Race', entries: nl.entries };
    const alDiv = { short: 'AL Wild Card Race', entries: al.entries };
    return `
      <div class="standings-league-section">
        ${this._divisionTableHtml(nlDiv, true, ['W','L','PCT','STRK','Last Ten','DIFF'], nl.tags)}
      </div>
      <div class="standings-league-section">
        ${this._divisionTableHtml(alDiv, true, ['W','L','PCT','STRK','Last Ten','DIFF'], al.tags)}
      </div>`;
  }

  return '';
}

_renderStandings(alData, nlData) {
  // kept for compatibility; not called after tab refactor
  return '';
}

closeStandingsModal() {
  document.getElementById('standings-modal').hidden = true;
  document.body.style.overflow = '';
}

openLinescoreModal(g) {
  const ls = this.lineScores?.get(g.gid);
  if (!ls) return;
  const { visitor, home } = ls;
  if (!visitor || !home) return;

  const brewersAbbr = BREWERS_IDS.has(home.team) ? home.team : visitor.team;
  const brewersIsHome = BREWERS_IDS.has(home.team);
  const oppLabel = g.Opponent;
  const brewersLabel = this.teamNames?.[brewersAbbr] || 'Milwaukee Brewers';
  const visLabel = brewersIsHome ? oppLabel : brewersLabel;
  const homLabel = brewersIsHome ? brewersLabel : oppLabel;

  const date = new Date(g.date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const playerName = (id) => (id && this.playerNames?.get(id)) || null;
  const pitchers = {
    wp: playerName(g.wp),
    lp: playerName(g.lp),
    save: playerName(g.save),
  };
  this._renderLinescore(`${visLabel} @ ${homLabel} — ${dateStr}`, visitor, home, visLabel, homLabel, !brewersIsHome, '', false, pitchers);
}

openLinescoreFromEvent(event) {
  const competition = event.competitions[0];
  const competitors = competition.competitors;

  let milC = null, oppC = null;
  competitors.forEach(c => {
    if (c.team.abbreviation === 'MIL') milC = c;
    else oppC = c;
  });
  if (!milC || !oppC) return;

  const milIsHome = milC.homeAway === 'home';
  const visC = milIsHome ? oppC : milC;
  const homC = milIsHome ? milC : oppC;
  const visLabel = visC.team.displayName || visC.team.shortDisplayName || visC.team.abbreviation;
  const homLabel = homC.team.displayName || homC.team.shortDisplayName || homC.team.abbreviation;

  const date = new Date(event.date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const title = `${visLabel} @ ${homLabel} — ${dateStr}`;
  const boxScoreUrl = event.id ? `https://www.espn.com/mlb/game/_/gameId/${event.id}` : '';

  // Show a loading state while we fetch the full linescore from the summary endpoint.
  // The schedule endpoint omits inning-by-inning runs and H/E; the summary endpoint has them.
  this._renderLinescore(title, { inns: [], r: 0, h: 0, e: 0 }, { inns: [], r: 0, h: 0, e: 0 }, visLabel, homLabel, milIsHome, boxScoreUrl, true);

  fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${event.id}`)
    .then(r => r.json())
    .then(data => {
      const comp = data.header?.competitions?.[0];
      if (!comp?.competitors) {
        this._renderLinescoreFromSchedule(title, visC, homC, visLabel, homLabel, milIsHome, boxScoreUrl);
        return;
      }
      let milS = null, oppS = null;
      comp.competitors.forEach(c => {
        if (c.team.abbreviation === 'MIL') milS = c;
        else oppS = c;
      });
      if (!milS || !oppS) {
        this._renderLinescoreFromSchedule(title, visC, homC, visLabel, homLabel, milIsHome, boxScoreUrl);
        return;
      }
      const visS = milIsHome ? oppS : milS;
      const homS = milIsHome ? milS : oppS;

      const toInns = (c) => {
        const ls = c.linescores || [];
        return ls.map(e => {
          const v = e.value ?? e.displayValue;
          return v === null || v === undefined ? '' : String(v);
        });
      };
      const sumHits = (c) => (c.linescores || []).reduce((s, e) => s + (parseInt(e.hits) || 0), 0);
      const sumErrors = (c) => (c.linescores || []).reduce((s, e) => s + (parseInt(e.errors) || 0), 0);

      const visitor = {
        inns: toInns(visS),
        r: parseInt(visS.score?.value ?? visS.score ?? 0),
        h: sumHits(visS),
        e: sumErrors(visS),
      };
      const home = {
        inns: toInns(homS),
        r: parseInt(homS.score?.value ?? homS.score ?? 0),
        h: sumHits(homS),
        e: sumErrors(homS),
      };
      const featured = comp.status?.featuredAthletes || [];
      const findP = (name) => featured.find(f => f.name === name);
      const fmtP = (f) => {
        if (!f || !f.athlete) return null;
        const a = f.athlete;
        let line = a.displayName || a.fullName;
        if (a.record) line += ` (${a.record})`;
        return line;
      };
      const pitchers = {
        wp: fmtP(findP('winningPitcher')),
        lp: fmtP(findP('losingPitcher')),
        save: fmtP(findP('savingPitcher')),
      };
      this._renderLinescore(title, visitor, home, visLabel, homLabel, milIsHome, boxScoreUrl, false, pitchers);
    })
    .catch(() => {
      this._renderLinescoreFromSchedule(title, visC, homC, visLabel, homLabel, milIsHome, boxScoreUrl);
    });
}

_renderLinescoreFromSchedule(title, visC, homC, visLabel, homLabel, milIsHome, boxScoreUrl) {
  const toInns = (c) => {
    const ls = c.linescores || [];
    return ls.map(e => {
      const v = e.value ?? e.displayValue;
      return v === null || v === undefined ? '' : String(v);
    });
  };
  const sumHits = (c) => (c.linescores || []).reduce((s, e) => s + (parseInt(e.hits) || 0), 0);
  const sumErrors = (c) => (c.linescores || []).reduce((s, e) => s + (parseInt(e.errors) || 0), 0);
  const visitor = {
    inns: toInns(visC),
    r: parseInt(visC.score?.value ?? visC.score ?? 0),
    h: sumHits(visC),
    e: sumErrors(visC),
  };
  const home = {
    inns: toInns(homC),
    r: parseInt(homC.score?.value ?? homC.score ?? 0),
    h: sumHits(homC),
    e: sumErrors(homC),
  };
  this._renderLinescore(title, visitor, home, visLabel, homLabel, milIsHome, boxScoreUrl);
}

_renderLinescore(title, visitor, home, visLabel, homLabel, milIsHome, boxScoreUrl = '', loading = false, pitchers = null) {
  const modal = document.getElementById('linescore-modal');
  document.getElementById('linescore-title').textContent = title;
  const body = document.getElementById('linescore-body');

  if (loading) {
    body.innerHTML = `<div class="loading">Loading line score…</div>`;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    return;
  }

  const maxInns = Math.max(
    ...visitor.inns.map((v, i) => (v !== '' ? i + 1 : 0)),
    ...home.inns.map((v, i) => (v !== '' ? i + 1 : 0)),
    9
  );

  const formatCell = (val) => (val === '' || val === undefined || val === null ? 'x' : val);

  const innHeaders = Array.from({ length: maxInns }, (_, i) => `<th>${i + 1}</th>`).join('');
  const visInns = Array.from({ length: maxInns }, (_, i) => `<td>${formatCell(visitor.inns[i])}</td>`).join('');
  const homInns = Array.from({ length: maxInns }, (_, i) => `<td>${formatCell(home.inns[i])}</td>`).join('');

  const rheHeaders = `<th class="linescore-rhe">R</th><th class="linescore-rhe">H</th><th class="linescore-rhe">E</th>`;
  const visRhe = `<td class="linescore-rhe linescore-total">${visitor.r}</td><td class="linescore-rhe">${visitor.h}</td><td class="linescore-rhe">${visitor.e}</td>`;
  const homRhe = `<td class="linescore-rhe linescore-total">${home.r}</td><td class="linescore-rhe">${home.h}</td><td class="linescore-rhe">${home.e}</td>`;

  body.innerHTML = `
    <div class="linescore-wrap">
      <table class="linescore-table">
        <thead>
          <tr>
            <th class="linescore-team-col">Team</th>
            ${innHeaders}
            ${rheHeaders}
          </tr>
        </thead>
        <tbody>
          <tr class="${milIsHome ? '' : 'linescore-brewers'}">
            <td class="linescore-team-col">${visLabel}</td>
            ${visInns}
            ${visRhe}
          </tr>
          <tr class="${milIsHome ? 'linescore-brewers' : ''}">
            <td class="linescore-team-col">${homLabel}</td>
            ${homInns}
            ${homRhe}
          </tr>
        </tbody>
      </table>
    </div>
    ${pitchers ? this._renderPitchers(pitchers) : ''}
    ${boxScoreUrl ? `<a class="linescore-box-link" href="${boxScoreUrl}" target="_blank" rel="noopener noreferrer">Full Box Score on ESPN <i class="mdi mdi-open-in-new"></i></a>` : ''}
  `;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

_renderPitchers(pitchers) {
  const items = [];
  if (pitchers.wp) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">WP</span><span class="linescore-pitcher-name">${pitchers.wp}</span></span>`);
  if (pitchers.lp) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">LP</span><span class="linescore-pitcher-name">${pitchers.lp}</span></span>`);
  if (pitchers.save) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">S</span><span class="linescore-pitcher-name">${pitchers.save}</span></span>`);
  if (!items.length) return '';
  return `<div class="linescore-pitchers">${items.join('')}</div>`;
}

closeLinescoreModal() {
  document.getElementById('linescore-modal').hidden = true;
  document.body.style.overflow = '';
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
