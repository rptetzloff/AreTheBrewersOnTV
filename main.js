class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';
        this.countdownInterval = null;
        this.liveUpdateInterval = null;
        this.currentSeason = null;
        this.latestSeason = null;
        this.earliestSeason = 1970;
        this.init();
    }

    async init() {
        try {
            await this.fetchPackersData();
            this.setupSeasonSelector();
        } catch (error) {
            this.showError('Failed to load Packers data');
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

    updateSeasonSelector() {
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
    }

    async loadSeason(year) {
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
            this.liveUpdateInterval = null;
        }
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        answerEl.innerHTML = 'Loading...';
        answerEl.className = 'answer loading';
        recordEl.textContent = '';
        document.getElementById('schedule-grid').innerHTML = '<div class="loading">Loading schedule...</div>';

        try {
            await this.fetchPackersData(year);
        } catch (error) {
            this.showError('Failed to load season data');
        }
    }

    async fetchPackersData(season) {
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
            this.processScheduleData({ events: [] });
        }
    }
    
    async fetchLiveGameScore(liveGame, scheduleData) {
        try {
            // Try multiple ESPN APIs for live scores
            const gameId = liveGame.id;
            
            // Try the scoreboard API first
            const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`;
            const response = await fetch(scoreboardUrl);
            const scoreboardData = await response.json();
            
            // Find the current game in scoreboard data
            const currentGame = scoreboardData.events?.find(event => event.id === gameId);
            
            if (currentGame && currentGame.competitions?.[0]?.competitors) {
                // Update the live game with scoreboard data
                currentGame.competitions[0].competitors.forEach(competitor => {
                    const teamId = competitor.team.id;
                    const score = competitor.score;
                    
                    // Find corresponding competitor in schedule data
                    const scheduleCompetitor = liveGame.competitions[0].competitors.find(comp => comp.team.id === teamId);
                    if (scheduleCompetitor && score) {
                        scheduleCompetitor.score = score;
                    }
                });
                
                // Try to get last play information
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
                // Fallback to boxscore API
                const boxscoreUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
                const boxResponse = await fetch(boxscoreUrl);
                const boxscoreData = await boxResponse.json();
                
                // Try to extract scores from boxscore
                if (boxscoreData.header?.competitions?.[0]?.competitors) {
                    boxscoreData.header.competitions[0].competitors.forEach(competitor => {
                        const teamId = competitor.team.id;
                        const score = competitor.score;
                        
                        // Find corresponding competitor in schedule data
                        const scheduleCompetitor = liveGame.competitions[0].competitors.find(comp => comp.team.id === teamId);
                        if (scheduleCompetitor && score) {
                            scheduleCompetitor.score = score;
                        }
                    });
                }
                
                // Try to get last play from boxscore
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
            // Fallback to schedule data without live scores
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

        // Only show offseason message for the current/latest season, not past seasons
        const isPastSeason = this.currentSeason && this.latestSeason && this.currentSeason < this.latestSeason;
        if (!isPastSeason && this.isOffseason(events)) {
            this.displayOffseasonMessage();
            this.displaySchedule(events, true);
            this.showLastUpdated();
            this.setupShareButtons();
            return;
        }
        
        const countRecord = (gameList) => {
            let w = 0, l = 0, t = 0;
            gameList.forEach(event => {
                const competitors = event.competitions[0].competitors;
                let packersScore = 0, opponentScore = 0;
                competitors.forEach(competitor => {
                    if (competitor.team.abbreviation === 'GB') {
                        packersScore = parseInt(competitor.score.value) || 0;
                    } else {
                        opponentScore = parseInt(competitor.score.value) || 0;
                    }
                });
                if (packersScore > opponentScore) w++;
                else if (packersScore < opponentScore) l++;
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

        // Check for Super Bowl win
        let superBowlName = null;
        completedPost.forEach(event => {
            const notes = event.competitions?.[0]?.notes || [];
            const sbNote = notes.find(n => /super bowl/i.test(n.headline || ''));
            if (!sbNote) return;
            const competitors = event.competitions[0].competitors;
            let packersScore = 0, opponentScore = 0;
            competitors.forEach(c => {
                if (c.team.abbreviation === 'GB') packersScore = parseInt(c.score?.value) || 0;
                else opponentScore = parseInt(c.score?.value) || 0;
            });
            if (packersScore > opponentScore) superBowlName = sbNote.headline;
        });
        const superBowlWin = !!superBowlName;

        // Display result
        const isUndefeated = losses === 0 && wins > 0;
        this.displayResult(isUndefeated, wins, losses, ties, isPastSeason, superBowlName, postRecord, preRecord);

        // Show full schedule
        this.displaySchedule(events, isPastSeason);

        // Show last updated
        this.showLastUpdated();

        // Setup share buttons
        this.setupShareButtons();
    }

    updateScheduleTitle(year, seasonType) {
        const titleEl = document.getElementById('schedule-title');
        if (!titleEl) return;
        const yearLabel = year ? `${year} ` : '';
        const isRegular = !seasonType || seasonType.toLowerCase().includes('regular');
        const typeLabel = !isRegular ? ` (${seasonType})` : '';
        titleEl.textContent = `📅 ${yearLabel}Season Schedule${typeLabel}`;
    }

    isOffseason(events) {
        const now = new Date();
        const currentYear = now.getFullYear();
        
        // NFL season typically runs from September to February
        // Offseason is roughly March through August
        const isOffseasonMonth = now.getMonth() >= 2 && now.getMonth() <= 7; // March (2) through August (7)
        
        // Also check if there are no scheduled games in the near future (next 30 days)
        const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        const hasUpcomingGames = events.some(event => {
            const gameDate = new Date(event.date);
            const status = event.competitions?.[0]?.status?.type?.name;
            return gameDate > now && gameDate <= thirtyDaysFromNow && status === 'STATUS_SCHEDULED';
        });
        
        // We're in offseason if it's offseason months AND no upcoming games
        return isOffseasonMonth && !hasUpcomingGames;
    }
    
    displayOffseasonMessage() {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        answerEl.innerHTML = `🏈<br>OFFSEASON`;
        answerEl.className = 'answer offseason';
        document.body.classList.remove('undefeated');
        document.body.classList.add('offseason');
        
        recordEl.textContent = 'The season hasn\'t started yet!';
    }

    displayResult(isUndefeated, wins, losses, ties, isPastSeason = false, superBowlName = null, postRecord = null, preRecord = null) {
        const superBowlWin = !!superBowlName;
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');

        if (isUndefeated) {
            const cheeseBlocks = wins > 0 ? '🧀 '.repeat(wins).trim() : '';
            answerEl.innerHTML = `${cheeseBlocks}<br>YES!!!`;
            answerEl.className = 'answer yes';
            document.body.classList.add('undefeated');
        } else if (superBowlWin) {
            answerEl.innerHTML = `🏆🏈🧀<br>${superBowlName.toUpperCase()}<br>CHAMPIONS!<br>🎉🎊🎉`;
            answerEl.className = 'answer champions';
            document.body.classList.remove('undefeated');
        } else {
            const cheeseBlocks = wins > 0 ? '🧀 '.repeat(wins).trim() + '<br>' : '';
            const frownFaces = losses > 0 ? '<br>' + '😢 '.repeat(losses).trim() : '';
            answerEl.innerHTML = `${cheeseBlocks}NO${frownFaces}`;
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
        
        // Sort events by date
        const sortedEvents = events.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Find next game
        const nextGame = sortedEvents.find(event => {
            const gameDate = new Date(event.date);
            const status = event.competitions?.[0]?.status?.type?.name;
            return gameDate > now && status === 'STATUS_SCHEDULED';
        });
        
        // Check for live game
        const liveGame = sortedEvents.find(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_IN_PROGRESS' || 
                   status === 'STATUS_HALFTIME' || 
                   status === 'STATUS_DELAYED' ||
                   status === 'STATUS_BREAK' ||
                   status === 'STATUS_TIMEOUT' ||
                   status === 'STATUS_END_PERIOD' ||
                   status === 'STATUS_RAIN_DELAY';
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
        // Find the most recent completed game or live game
        let mostRecentCompletedIndex = -1;
        
        for (let i = sortedEvents.length - 1; i >= 0; i--) {
            const event = sortedEvents[i];
            const status = event.competitions?.[0]?.status?.type?.name;
            
            // Prioritize live games, then most recent completed games
            if (status === 'STATUS_IN_PROGRESS' || 
                status === 'STATUS_HALFTIME' || 
                status === 'STATUS_DELAYED' ||
                status === 'STATUS_FINAL') {
                mostRecentCompletedIndex = i;
                break;
            }
        }
        
        // If we found a recent game, scroll to it
        if (mostRecentCompletedIndex >= 0) {
            const gameItems = scheduleGrid.children;
            if (gameItems[mostRecentCompletedIndex]) {
                // Calculate the position to scroll to within the schedule grid
                const gameItem = gameItems[mostRecentCompletedIndex];
                const containerHeight = scheduleGrid.clientHeight;
                const itemHeight = gameItem.offsetHeight;
                const itemTop = gameItem.offsetTop;
                
                // Center the item in the container
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
        
        let packersScore = 0;
        let opponentScore = 0;
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                // Try multiple ways to get the score
                packersScore = parseInt(
                    competitor.score?.value || 
                    competitor.score?.displayValue ||
                    competitor.score || 
                    0
                );
                isHome = competitor.homeAway === 'home';
            } else {
                // Try multiple ways to get the score
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
        
        // Determine game status and styling
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
            if (packersScore > opponentScore) {
                gameItem.classList.add('win');
            } else if (packersScore < opponentScore) {
                gameItem.classList.add('loss');
            }
        }
        
        // Create game info
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

        if (isLive) {
            dateDiv.innerHTML = `<span class="live-indicator-small"></span>LIVE NOW${network ? ` · <span class="game-network">${network}</span>` : ''}`;
        } else if (isInProgress) {
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
        
        // Add time remaining for live games
        if (isLive || isInProgress) {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'game-status';
            
            const statusText = status.type.detail || status.type.shortDetail || 'Live';
            statusDiv.textContent = statusText;
            
            gameDetails.appendChild(statusDiv);
            
            // Add last play information if available
            if (event.lastPlay) {
                const lastPlayDiv = document.createElement('div');
                lastPlayDiv.className = 'last-play';
                
                let playText = '';
                
                // Add possession information
                if (event.lastPlay.possession) {
                    const possessionTeamId = event.lastPlay.possession;
                    // Find the team name from competitors
                    const possessionTeam = competitors.find(comp => comp.team.id == possessionTeamId);
                    const teamName = possessionTeam ? possessionTeam.team.abbreviation : possessionTeamId;
                    playText += `${teamName} Ball\n`;
                }
                
                // Add down and distance
                if (event.lastPlay.downDistanceText) {
                    playText += event.lastPlay.downDistanceText;
                    playText += '\n';
                }
                
                // Add current drive description
                if (event.lastPlay.drive?.description) {
                    // Try to determine whose drive it is
                    let driveTeam = '';
                    if (event.lastPlay.drive.team) {
                        const driveTeamData = competitors.find(comp => comp.team.id == event.lastPlay.drive.team);
                        driveTeam = driveTeamData ? `${driveTeamData.team.abbreviation} ` : '';
                    }
                    playText += `${driveTeam}Drive: ${event.lastPlay.drive.description}\n`;
                }
                
                // Add last play text
                if (event.lastPlay.text) {
                    playText += `\nLast Play:\n${event.lastPlay.text}`;
                }
                
                if (playText.trim()) {
                    lastPlayDiv.textContent = playText.trim();
                    gameDetails.appendChild(lastPlayDiv);
                }
            }
        }
        
        // Add countdown for next game
        if (isNext) {
            const countdownDiv = document.createElement('div');
            countdownDiv.className = 'countdown-small';
            
            const gameDate = new Date(event.date);
            const now = new Date();
            const timeLeft = gameDate - now;
            
            if (timeLeft > 0) {
                const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                
                let countdownText = '⏰ ';
                if (days > 0) {
                    countdownText += `${days}d ${hours}h ${minutes}m`;
                } else if (hours > 0) {
                    countdownText += `${hours}h ${minutes}m`;
                } else {
                    countdownText += `${minutes}m`;
                }
                
                countdownDiv.textContent = countdownText;
            } else {
                countdownDiv.textContent = '🏈 Game Time!';
            }
            
            gameDetails.appendChild(countdownDiv);
        }
        
        gameInfo.appendChild(gameDetails);
        
        // Create game result
        const gameResult = document.createElement('div');
        gameResult.className = 'game-result';
        
        gameItem.appendChild(gameInfo);
        
        if (isCompleted) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'game-score';
            
            let resultIndicator = '';
            if (packersScore > opponentScore) {
                scoreDiv.classList.add('win');
                resultIndicator = 'W ';
            } else if (packersScore < opponentScore) {
                scoreDiv.classList.add('loss');
                resultIndicator = 'L ';
            } else {
                resultIndicator = 'T ';
            }
            
            // Create clickable link to ESPN box score
            const scoreLink = document.createElement('a');
            scoreLink.href = `https://www.espn.com/nfl/game/_/gameId/${event.id}`;
            scoreLink.target = '_blank';
            scoreLink.rel = 'noopener noreferrer';
            scoreLink.textContent = `${resultIndicator}${packersScore}-${opponentScore}`;
            scoreLink.style.color = 'inherit';
            scoreLink.style.textDecoration = 'none';
            
            scoreDiv.appendChild(scoreLink);
            scoreDiv.style.textAlign = 'center';
            scoreDiv.style.marginTop = '0.5rem';
            scoreDiv.style.width = '100%';
            gameItem.appendChild(scoreDiv);
        } else if (isLive || isInProgress) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'game-score';
            scoreDiv.classList.add('live');
            
            // Create clickable link to ESPN box score for live games too
            const scoreLink = document.createElement('a');
            scoreLink.href = `https://www.espn.com/nfl/game/_/gameId/${event.id}`;
            scoreLink.target = '_blank';
            scoreLink.rel = 'noopener noreferrer';
            scoreLink.textContent = `${packersScore}-${opponentScore}`;
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
        
        // Clear any existing intervals
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        // Update every 30 seconds during live games
        this.liveUpdateInterval = setInterval(async () => {
            try {
                await this.fetchPackersData();
            } catch (error) {
                console.error('Error updating live game:', error);
            }
        }, 30000);
    }

    showLastUpdated() {
        const el = document.getElementById('last-updated');
        const now = new Date();
        el.textContent = `Last updated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
    }
    
    setupShareButtons() {
        const copyBtn = document.getElementById('share-copy');
        
        copyBtn.addEventListener('click', () => this.copyLink());
    }
    
    getShareMessage() {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        const isUndefeated = answerEl.textContent.includes('YES');
        const isOffseason = answerEl.textContent.includes('OFFSEASON');
        const record = recordEl.textContent;
        
        if (isOffseason) {
            return `🏈 Green Bay Packers offseason - can't wait for the new season! #GoPackGo`;
        } else if (isUndefeated) {
            return `🧀 The Green Bay Packers are UNDEFEATED! ${record} 🧀 #GoPackGo`;
        } else {
            return `The Green Bay Packers are ${record} this season. #GoPackGo`;
        }
    }
    
    async copyLink() {
        const copyBtn = document.getElementById('share-copy');
        const message = this.getShareMessage();
        const url = window.location.href;
        const shareText = `${message}\n\nCheck it out: ${url}`;
        
        try {
            await navigator.clipboard.writeText(shareText);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
            
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
        }
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
    new PackersTracker();
});