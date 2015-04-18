define(['platform', 'game', 'vector', 'staticcollidable', 'linesegment', 'editor', 'required', 'state', 'level', 'mouse', 'collision', 'keyboard', 'quake', 'resources', 'objectmanager','graphics', 'particleemitter'], function(platform, Game, Vector, StaticCollidable, LineSegment, editor, required, state, level, mouse, collision, keyboard, quake, resources, ObjectManager,Graphics, ParticleEmitter) {
    var t = new Vector(0, 0);
    var t2 = new Vector(0, 0);
    var rs = {
        'images': ['background','ice','icepuff','enemy','bullet','icebullet','icefractal'],
        'audio': []
    };
    var g, game;
    platform.once('load', function() {
        var canvas = document.getElementById('main');
        game = g = new Game(startGame, canvas, [required(['chrome']), mouse, keyboard, resources(rs), state, level, collision, quake]);
        g.resources.status.on('changed', function() {
            g.graphics.context.clearRect(0, 0, game.width, game.height);
            g.graphics.context.fillStyle = 'black';
            g.graphics.context.font = 'arial';
            g.graphics.fillCenteredText('Preloading ' + g.resources.status.ready + '/' + g.resources.status.total + '...', 400, 300);
        });
    });

    function startGame(err) {
        if (err) {
            console.error(err);
        }
        var images = g.resources.images;
        var audio = g.resources.audio;

        (function() {
            for(var name in images) {
                var image = images[name];
                if (!(image instanceof HTMLImageElement)) { continue; }
                var w = image.width;
                var h = image.height;
                var srcCanvas = document.createElement('canvas');
                srcCanvas.width = w; srcCanvas.height = h;
                var srcContext = srcCanvas.getContext('2d');
                srcContext.drawImage(image, 0, 0);
                var imageData = srcContext.getImageData(0,0,w,h);

                console.log(imageData.data.length);
                for(var i=0;i<imageData.data.length;i+=4) {
                    imageData.data[i] = 255;
                    imageData.data[i+1] = 255;
                    imageData.data[i+2] = 255;
                }

                var dstCanvas = document.createElement('canvas');
                dstCanvas.width = w; dstCanvas.height = h;
                var dstContext = dstCanvas.getContext('2d');
                dstContext.putImageData(imageData,0,0);

                image.mask = dstCanvas;
            }
        })();

        images.icePattern = game.graphics.context.createPattern(images.ice,'repeat');

        g.objects.lists.particle = g.objects.createIndexList('particle');
        g.objects.lists.spring = g.objects.createIndexList('spring');
        g.objects.lists.start = g.objects.createIndexList('start');
        g.objects.lists.finish = g.objects.createIndexList('finish');
        g.objects.lists.enemy = g.objects.createIndexList('enemy');
        g.objects.lists.usable = g.objects.createIndexList('usable');
        g.objects.lists.collectable = g.objects.createIndexList('collectable');
        g.objects.lists.shadow = g.objects.createIndexList('shadow');
        g.objects.lists.background = g.objects.createIndexList('background');
        g.objects.lists.foreground = g.objects.createIndexList('foreground');
        g.objects.lists.grounded = g.objects.createIndexList('grounded');
        g.objects.lists.path = g.objects.createIndexList('path');

        var background = document.getElementById('background');
        var backgroundContext = background.getContext('2d');

        var trail = document.getElementById('trail');
        var trailContext = trail.getContext('2d');

        var finishSounds = [audio.finish01,audio.finish02,audio.finish03];
        var jumpSounds = [audio.jump01,audio.jump02,audio.jump03,audio.jump04];

        // Gravity.
        g.gravity = (function() {
         var me = {
             enabled: true,
             enable: enable,
             disable: disable,
             toggle: toggle
         };
         function enable() { me.enabled = true; }
         function disable() { me.enabled = false; }
         function toggle() { if (me.enabled) disable(); else enable(); }
         function update(dt,next) {
             g.objects.lists.particle.each(function(p) {
                 if (me.enabled) {
                     p.velocity.y += 200*dt;
                 }
             });
             next(dt);
         }
         g.chains.update.push(update);
         return me;
        })();
        // Auto-refresh
        (function() {
         var timeout = setTimeout(function() {
             document.location.reload(true);
         }, 3000);
         g.once('keydown',function() {
             disable();
         });
         g.once('mousemove',function() {
             disable();
         });
         g.chains.draw.unshift(draw);
         function draw(g,next) {
             // console.log(game.chains.draw.slice(0));
             g.fillStyle('#ff0000');
             g.fillCircle(game.width,0,30);
             g.fillStyle('black');
             next(g);
         }
         function disable() {
             clearTimeout(timeout);
             g.chains.draw.remove(draw);
         }
        })();
        // Camera
        (function() {
            game.camera = new Vector(0,0);
            game.camera.zoom = 1;
            game.camera.PTM = 1;
            game.camera.x = -(game.width * 0.5) / getPixelsPerMeter();
            game.camera.y = (game.height * 0.5) / getPixelsPerMeter();
            game.camera.screenToWorld = function(screenV, out) {
                var ptm = getPixelsPerMeter();
                out.x = screenV.x / ptm + game.camera.x;
                out.y = -(screenV.y / ptm - game.camera.y);
            };
            game.camera.worldToScreen = function(worldV, out) {
                var ptm = getPixelsPerMeter();
                out.x = (worldV.x - game.camera.x) * ptm;
                out.y = (worldV.y - game.camera.y) * ptm * -1;
            };
            game.camera.getPixelsPerMeter = getPixelsPerMeter;

            function getPixelsPerMeter() {
                return game.camera.PTM / game.camera.zoom;
            }
            game.camera.reset = function() {
                var ptm = getPixelsPerMeter();
                var targetx = player.position.x - (game.width * 0.5) / ptm;
                var targety = player.position.y + (game.height * 0.5) / ptm;
                targetx += player.velocity.x * 10;
                targety += player.velocity.y * 10;
                game.camera.x = targetx;
                game.camera.y = targety;
            };
            var pattern;

            function drawCamera(g, next) {
                var ptm = getPixelsPerMeter();
                // if (!pattern) {
                //   pattern = g.context.createPattern(images.background,'repeat');
                // }
                // Follow player
                var targetx = player.position.x - (game.width * 0.5) / ptm;
                var targety = (game.height * 0.5) / ptm;
                // Look forward
                // targetx += player.velocity.x * 10;
                // targety += player.velocity.y * 10;
                // Smooth
                // game.camera.x = 0.8 * game.camera.x + 0.2 * targetx;
                // game.camera.y = 0.8 * game.camera.y + 0.2 * targety;
                // No smoothing
                game.camera.x = Math.max(game.camera.x, targetx);
                game.camera.y = targety;
                // g.save();
                // g.context.translate(-x*ptm,y*ptm);
                // g.fillStyle(pattern);
                // g.fillRectangle(x*ptm,-y*ptm,game.width,game.height);
                // g.restore();
                g.save();
                g.context.scale(ptm, -ptm);
                g.context.lineWidth /= ptm;
                g.context.translate(-game.camera.x, -game.camera.y);
                next(g);
                g.restore();
            }
            g.chains.draw.camera = drawCamera;
            g.chains.draw.insertBefore(drawCamera, g.chains.draw.objects);
        })();

        // Draw background
        // (function() {
        //     var topLeft = new Vector(0,0);
        //     var bottomRight = new Vector(0,0);
        //     game.chains.draw.insertAfter(function(g,next) {
        //         var pixelSize = 1;
        //         var worldSize = pixelSize * game.camera.PTM;
        //         t.set(0,0);
        //         game.camera.screenToWorld(t,topLeft);
        //         t.set(game.width,game.height);
        //         game.camera.screenToWorld(t,bottomRight);
        //         topLeft.x = Math.floor(topLeft.x / worldSize) * worldSize;
        //         topLeft.y = Math.floor(topLeft.y / worldSize) * worldSize;
        //         bottomRight.x = Math.floor(bottomRight.x / worldSize + 1) * worldSize;
        //         bottomRight.y = Math.floor(bottomRight.y / worldSize - 1) * worldSize;
        //         for(var x = topLeft.x; x <= bottomRight.x; x += worldSize) {
        //         for(var y = topLeft.y; y >= bottomRight.y; y -= worldSize) {
        //             g.drawImage(images.background,x,y,worldSize,worldSize);
        //         }}
        //         next(g);

        //     },game.chains.draw.camera);
        // })

        // Collision
        var handleCollision = (function() {
            var t = new Vector(0, 0)
            var t2 = new Vector(0, 0);

            return function handleCollision(chunks) {
                chunks.forEach(function(chunk) {
                    chunk.objects.lists.collide.each(function(o) {
                        if (!o.velocity) {
                            return;
                        }
                        o.surface = null;
                        var iterations = 5;
                        while (iterations-- > 0) {
                            var collisions = [];

                            function handleCollisionLineSegments(lineSegments) {
                                for (var i = 0; i < lineSegments.length; i++) {
                                    var lineSegment = lineSegments[i];
                                    t.setV(lineSegment.normal);
                                    t.normalRight();
                                    var l = lineSegment.start.distanceToV(lineSegment.end);
                                    t2.setV(o.position);
                                    t2.substractV(lineSegment.start);
                                    var offY = lineSegment.normal.dotV(t2) - o.collisionRadius;
                                    var offX = t.dotV(t2);
                                    if (offY < -o.collisionRadius * 2) {
                                        continue;
                                    } else if (offY < 0) {
                                        if (offX > 0 && offX < l) {
                                            offY *= -1;
                                            collisions.push({
                                                x: lineSegment.start.x + t.x * offX,
                                                y: lineSegment.start.y + t.y * offX,
                                                normalx: lineSegment.normal.x,
                                                normaly: lineSegment.normal.y,
                                                offset: offY
                                            });
                                        } else if (offX < 0 && offX > -o.collisionRadius) {
                                            var d = o.position.distanceToV(lineSegment.start);
                                            if (d < o.collisionRadius) {
                                                t.setV(o.position);
                                                t.substractV(lineSegment.start);
                                                t.normalize();
                                                collisions.push({
                                                    x: lineSegment.start.x,
                                                    y: lineSegment.start.y,
                                                    normalx: t.x,
                                                    normaly: t.y,
                                                    offset: o.collisionRadius - d
                                                });
                                            }
                                        } else if (offX > l && offX < l + o.collisionRadius) {
                                            var d = o.position.distanceToV(lineSegment.end);
                                            if (d < o.collisionRadius) {
                                                t.setV(o.position);
                                                t.substractV(lineSegment.end);
                                                t.normalize();
                                                collisions.push({
                                                    x: lineSegment.end.x,
                                                    y: lineSegment.end.y,
                                                    normalx: t.x,
                                                    normaly: t.y,
                                                    offset: o.collisionRadius - d
                                                });
                                            }
                                        }
                                    } else {
                                        continue;
                                    }
                                }
                            }
                            chunks.forEach(function(chunk) {
                                chunk.objects.lists.collidable.each(function(collidable) {
                                    handleCollisionLineSegments(collidable.collisionlines);
                                });
                            });
                            if (collisions.length > 0) {
                                // console.log(collisions.map(function(c) { return c.offset; }));
                                collisions.sort(function(a, b) {
                                    return b.offset - a.offset;
                                });
                                var c = collisions[0];
                                o.position.add(c.normalx * c.offset, c.normaly * c.offset);
                                var vc = o.velocity.dot(c.normalx, c.normaly);
                                o.velocity.substract(c.normalx * vc, c.normaly * vc);
                                o.surface = c;
                                if (o.collided) {
                                    o.collided(c);
                                }
                            } else {
                                break;
                            }
                        }
                        if (iterations === 0) {
                            console.error('Collision broken');
                        }
                    });
                });
            }
        }());
        // Tracing
        (function() {
            var t = new Vector(0, 0);

            function IsOnSegment(xi, yi, xj, yj, xk, yk) {
                return (xi <= xk || xj <= xk) && (xk <= xi || xk <= xj) && (yi <= yk || yj <= yk) && (yk <= yi || yk <= yj);
            }

            function ComputeDirection(xi, yi, xj, yj, xk, yk) {
                var a = (xk - xi) * (yj - yi);
                var b = (xj - xi) * (yk - yi);
                return a < b ? -1 : a > b ? 1 : 0;
            }
            // From: http://ptspts.blogspot.nl/2010/06/how-to-determine-if-two-line-segments.html
            function DoLineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
                var d1 = ComputeDirection(x3, y3, x4, y4, x1, y1);
                var d2 = ComputeDirection(x3, y3, x4, y4, x2, y2);
                var d3 = ComputeDirection(x1, y1, x2, y2, x3, y3);
                var d4 = ComputeDirection(x1, y1, x2, y2, x4, y4);
                return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) || (d1 == 0 && IsOnSegment(x3, y3, x4, y4, x1, y1)) || (d2 == 0 && IsOnSegment(x3, y3, x4, y4, x2, y2)) || (d3 == 0 && IsOnSegment(x1, y1, x2, y2, x3, y3)) || (d4 == 0 && IsOnSegment(x1, y1, x2, y2, x4, y4));
            }
            // From: http://www.ahristov.com/tutorial/geometry-games/intersection-lines.html
            function intersection(x1, y1, x2, y2, x3, y3, x4, y4, result) {
                var d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
                if (d == 0) return false;
                var xi = ((x3 - x4) * (x1 * y2 - y1 * x2) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
                var yi = ((y3 - y4) * (x1 * y2 - y1 * x2) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
                result.set(xi, yi);
                return true;
            }
            g.cantrace = function(fromx, fromy, tox, toy) {
                var result = true;
                game.objects.lists.collidable.each(function(collidable, BREAK) {
                    for (var i = 0; i < collidable.collisionlines.length; i++) {
                        var cl = collidable.collisionlines[i];
                        var fd = cl.normal.dot(fromx - tox, fromy - toy);
                        // Is collision in right direction (toward fromxy)
                        if (fd < 0) {
                            continue;
                        }
                        // Are line-segments intersecting?
                        if (!DoLineSegmentsIntersect(fromx, fromy, tox, toy, cl.start.x, cl.start.y, cl.end.x, cl.end.y)) {
                            continue;
                        }
                        result = false;
                        return BREAK;
                    }
                });
                return result;
            };
            g.trace = function(fromx, fromy, tox, toy) {
                var c = null;
                game.objects.lists.collidable.each(function(collidable) {
                    for (var i = 0; i < collidable.collisionlines.length; i++) {
                        var fd = cl.normal.dot(fromx - tox, fromy - toy);
                        // Is collision in right direction (toward fromxy)
                        if (fd < 0) {
                            return;
                        }
                        // Are line-segments intersecting?
                        if (!DoLineSegmentsIntersect(fromx, fromy, tox, toy, cl.start.x, cl.start.y, cl.end.x, cl.end.y)) {
                            return;
                        }
                        // Get intersection
                        if (!intersection(fromx, fromy, tox, toy, cl.start.x, cl.start.y, cl.end.x, cl.end.y, t)) {
                            return;
                        }
                        // Determine the closest intersecting collisionline
                        var distance = t.distanceTo(fromx, fromy);
                        if (!c || c.distance > distance) {
                            c = {
                                collidable: collidable,
                                cl: cl,
                                distance: distance,
                                x: t.x,
                                y: t.y
                            };
                        }
                    }
                });
                return c;
            }
        })();
        // Foreground and background
        (function() {
            var game = g;
            game.chains.draw.push(function(g, next) {
                game.objects.lists.background.each(function(o) {
                    o.drawBackground(g);
                });
                game.objects.lists.shadow.each(function(o) {
                    o.drawShadow(g);
                });
                game.objects.lists.foreground.each(function(o) {
                    o.drawForeground(g);
                });
                // game.objects.lists.drawItem.each(function(o) {
                //  o.drawItem(g);
                // });
                next(g);
            });
        })();
    // Touching
    (function() {
        g.objects.lists.touchable = g.objects.createIndexList('touchable');
        g.chains.update.push(function(dt,next) {
            g.objects.lists.touchable.each(function(ta) {
                g.objects.lists.touchable.each(function(tb) {
                    if (ta.position.distanceToV(tb.position) <= ta.touchRadius+tb.touchRadius) {
                        if (ta.touch) { ta.touch(tb); }
                    }
                });
            });
            next(dt);       
        });
    })();

        function getAngle(v) {
            return Math.atan2(v.y,v.x);
        }
        function getAngleFrom(from,v) {
            return Math.atan2(v.y-from.y,v.x-from.x);
        }
        function getVectorFromAngle(angle,v) {
            v.set(
                Math.cos(angle),
                Math.sin(angle)
            );
        }
        function getVectorFromAngleRadius(angle,radius,v) {
            getVectorFromAngle(angle,v);
            v.multiply(radius);
        }
        function getPositionFromAngleRadius(angle,radius,position,v) {
            getVectorFromAngleRadius(angle,radius,v);
            v.addV(position);
        }

        //#gameobjects
        function circleFiller(r) {
            return function(g) {
                g.fillCircle(this.position.x, this.position.y, r);
            };
        }

        function slide(a, b) {
            return (a ? 0 : 1) - (b ? 0 : 1);
        }

        // Player
        function Player() {
            this.position = new Vector(0, 0);
            this.velocity = new Vector(0, 0);
            this.touchRadius = this.collisionRadius = 10;
            this.sticktime = 0;
            this.touching = [];
            this.weight = 1;
            this.line = undefined;
            this.lineOffset = 0;
            this.lineSpeed = 0;
            this.iceSmokeEmitter = new ParticleEmitter(images.icepuff, 100, 0.005, function(particle) {
                if (!this.path) { return; }
                particle.posx = this.path.lastPoint().x + rnd()*3;
                particle.posy = this.path.lastPoint().y + rnd()*3;
                particle.velx = 0;//Math.random();
                particle.vely = 0;//Math.random();
                particle.rot = rnd() * Math.PI;
                particle.rotrate = 0;
                particle.scale = 0.2;
                particle.time = 1;
                particle.active = true;
            }.bind(this), function(particle,dt) {
                // console.log(particle);
                particle.posx += particle.velx;
                particle.posy += particle.vely;
                particle.time -= dt;
                particle.active = particle.time > 0;

            }.bind(this));
            this.iceFractalEmitter = new ParticleEmitter(images.icefractal, 100, 0.05, function(particle) {
                if (!this.path) { return; }
                var front = Math.random() > 0.5;
                particle.posx = this.path.lastPoint().x + rnd()*10;
                particle.posy = this.path.lastPoint().y + rnd()*10;
                particle.velx = 0;//Math.random();
                particle.vely = 0;//Math.random();
                particle.rot = rnd() * Math.PI;
                particle.rotrate = 0;
                particle.scale = front ? 0.4 : 0.2;
                particle.time = front ? 0.5 : 5;
                particle.active = true;
            }.bind(this), function(particle,dt) {
                // console.log(particle);
                particle.posx += particle.velx;
                particle.posy += particle.vely;
                particle.time -= dt;
                particle.active = particle.time > 0;

            }.bind(this));
        }
        (function(p) {
            p.updatable = true;
            p.foreground = true;
            p.collide = true;
            p.touchable = true;
            p.damageable = true;
            p.update = function(dt) {
                var me = this;

                this.iceFractalEmitter.update(dt);
                this.iceSmokeEmitter.update(dt);

                var maxspeed = 8;
                if (this.line) {
                    var newLineSpeed = this.lineSpeed;
                    newLineSpeed += 0.1;
                    newLineSpeed += -this.line.normal.x * 0.2;
                    newLineSpeed = Math.min(maxspeed, newLineSpeed);
                    newLineSpeed = Math.max(0.1, newLineSpeed);
                    var previousLine = this.line;
                    if (this.lineSpeed > 0 && newLineSpeed < 1) {
                        newLineSpeed = 1;
                    }
                    this.lineSpeed = newLineSpeed;
                    this.lineOffset += this.lineSpeed;
                    while(this.line && this.lineOffset > this.line.length) {
                        this.lineOffset -= this.line.length;
                        previousLine = this.line;
                        this.line = this.line.next;
                    }

                    var line = this.line || previousLine;
                    this.position.setV(line.end);
                    this.position.substractV(line.start);
                    this.position.normalize();
                    this.position.multiply(this.lineOffset);
                    this.position.addV(line.start);

                    var t = new Vector(0,0);
                    t.setV(line.end);
                    t.substractV(line.start);
                    t.normalize();
                    this.velocity.setV(t);
                    this.velocity.multiply(this.lineSpeed);
                } else {
                    this.velocity.y -= 0.1 * this.weight;

                    this.position.add(
                        this.velocity.x,
                        this.velocity.y
                    );
                }

                var speed = this.velocity.length();
                if (this.velocity.length() > maxspeed) {
                    this.velocity.normalize();
                    this.velocity.multiply(maxspeed);
                }
            };
            p.draw = function(g) {
                var me = this;
                // g.fillStyle(this.velocity.length() >= 0.8 ? 'red' : 'blue');
            };
            p.drawForeground = function(g) {
                g.fillStyle('hsl('+Math.floor(((game.time*50)%360))+', 76%, 53%)')
                g.fillRectangle(this.position.x-5,this.position.y-5,10,10);
                this.iceFractalEmitter.draw(g);
                this.iceSmokeEmitter.draw(g);
            };
            p.touch = function(other) {
                var me = this;

            };
            p.jump = function() {
                var me = this;
                if (this.sticksurface && this.sticksurface.normaly <= 0) {
                    pick(jumpSounds).play();
                    this.velocity.y += this.sticksurface.normaly * 0.4 - 0.3;
                    this.velocity.x += this.sticksurface.normalx * 0.7;
                }
            };
            p.startPath = function(x,y) {
                this.path = new IcePath(this.position.x,this.position.y);
                this.growPath(x,y);
                game.objects.add(this.path);
                this.line = this.path.collisionlines[0];
                this.lineOffset = 0;
                this.lineSpeed = this.line.end.clone().substractV(this.line.start).dotV(this.velocity);
                console.log(this.path, this.line, this.lineOffset, this.lineSpeed);
                this.iceFractalEmitter.spawn(10);
            };
            p.growPath = function(x,y) {
                var lastPoint = this.path.lastPoint();
                var t = new Vector(0,0);
                t.set(x,y);
                t.substractV(lastPoint);
                var dist = t.length();
                t.normalizeOr(1,0);
                t.multiply(Math.min(15, dist));
                t.addV(lastPoint);
                if (t.distanceToV(this.position) < 80) {
                    this.path.addPoint(t.x, t.y);
                }
            };
            p.endPath = function() {
                this.iceFractalEmitter.spawn(10);
                this.path = null;
            },
            p.fire = function(x,y) {
                console.log('fire');
                var t = new Vector(x,y);
                t.substractV(this.position);
                t.normalize();
                t.multiply(10);
                var bullet = new Bullet(this, images.icebullet,
                    this.position.x, this.position.y,
                    t.x, t.y);
                game.objects.add(bullet);
            };
        })(Player.prototype);

        function IcePath(x,y) {
            this.lines = [new Vector(x,y)];
            this.collisionlines = [];
        }
        (function(p) {
            p.foreground = true;
            p.path = true;
            p.addPoint = function(x,y) {
                var lines = this.lines;
                var collisionlines = this.collisionlines;
                var lastPoint = lines[lines.length-1];
                if (!lastPoint.equals(x,y)) {
                    var line = new LineSegment(
                        lastPoint.x,lastPoint.y,
                        x,y
                    );
                    line.path = this;
                    if (collisionlines.length > 0) {
                        collisionlines[collisionlines.length-1].next = line;
                    }
                    lines.push(line.end);
                    collisionlines.push(line);
                }
            };
            p.lastPoint = function() {
                return this.lines[this.lines.length-1];
            };
            p.drawForeground = function(g) {
                var lines = this.lines;
                if (lines.length < 2) { return; }
                g.strokeStyle('white');
                g.context.beginPath();
                g.context.moveTo(
                    lines[lines.length-1].x,
                    lines[lines.length-1].y
                );
                for(var i=lines.length-1;i>1;i--) {
                    g.context.quadraticCurveTo(
                        lines[i].x,lines[i].y,
                        (lines[i-1].x+lines[i].x)*0.5,(lines[i-1].y+lines[i].y)*0.5
                    );
                }
                g.context.lineCap = 'round';
                g.context.lineWidth = 20;
                g.strokeStyle(images.icePattern);
                g.context.stroke();
            };
        })(IcePath.prototype);

        function Bullet(owner, image, x, y, vx, vy, angle, angleRate, damage) {
            this.owner = owner;
            this.image = image;
            this.position = new Vector(x,y);
            this.velocity = new Vector(vx, vy);
            this.angle = angle === undefined ? Math.atan2(this.velocity.y, this.velocity.x) : angle;
            this.angleRate = angleRate || 0;
            this.damage = damage || 1;
            this.touchRadius = 5;
        }
        (function(p) {
            p.foreground = true;
            p.updatable = true;
            p.touchable = true;
            p.drawForeground = function(g) {
                g.rotate(this.position.x, this.position.y, this.angle, function() {
                    g.drawCenteredImage(this.image, this.position.x, this.position.y);
                }.bind(this));
            };
            p.update = function(dt) {
                this.position.addV(this.velocity);
                this.angle += this.angleRate * dt;
            };
            p.touch = function(other) {
                if (other === this.owner) { return; }
                if (!other.damageable) { return; }
                other.damage(this.damage);
                game.objects.remove(this);
            }
        })(Bullet.prototype);

        function Enemy(image, x, y, vx, vy, health) {
            this.position = new Vector(x,y);
            this.velocity = new Vector(vx, vy);
            this.image = image;
            this.health = health;
            this.damageTime = 0;
            this.touchRadius = 30;
        }
        (function(p) {
            p.updatable = true;
            p.foreground = true;
            p.touchable = true;
            p.damageable = true;
            p.drawForeground = function(g) {
                var shake = this.damageTime > 0 ? 10 : 0;
                var image = this.damageTime > 0 ? this.image.mask : this.image;
                g.translate(rnd() * shake, rnd() * shake, function() {
                    g.drawCenteredImage(image, this.position.x, this.position.y);
                }.bind(this));
            };
            p.update = function(dt) {
                this.position.addV(this.velocity);
                this.damageTime -= dt;
            };
            p.damage = function(amount) {
                if (this.damageTime > 0) { return; }
                console.log('damage',amount);
                this.health -= amount;
                this.damageTime = 0.1;
                if (this.health < 0) {
                    game.objects.remove(this);
                }
            };
        })(Enemy.prototype);

        game.chains.draw.push(function(g,next) {
            g.fillStyle('white');
            g.fillRectangle(-100,-100,200,200);
            g.strokeStyle('red');
            g.strokeLine(0,0,100,0);
            g.strokeStyle('blue');
            g.strokeLine(0,0,0,100);
            next(g);
        });

        game.objects.add(player = new Player());
        setInterval(function() {
            // game.objects.add(new Bullet(null, images.enemy, game.camera.x + game.width, 200, -1, 0));
            game.objects.add(new Enemy(images.enemy, game.camera.x + game.width, 0, -1, 0, 5));
        },3000);

        //#states
        function gameplayState() {
            var me = {
                enabled: false,
                enable: enable,
                disable: disable
            };
            function enable() {
                g.chains.update.push(update);
                // g.chains.draw.insertBefore(draw, g.chains.draw.camera);
                g.on('mousedown', mousedown);
                g.on('mouseup', mouseup);
                g.on('keydown',keydown);
            }

            function disable() {
                g.chains.update.remove(update);
                // g.chains.draw.remove(draw);
                g.removeListener('mousedown', mousedown);
                g.removeListener('mouseup', mouseup);
                g.removeListener('keydown',keydown);
            }

            function keydown(key) {
                if (key === 'x' || key === 'w' || key === 'space' || key === 'z') {
                } else if (key === 'r') {
                }
            }

            function update(dt, next) {
                // Post update
                if (player.path) {
                    var t = new Vector(0,0);
                    getAimPosition(t);
                    player.growPath(t.x,t.y);
                }

                next(dt);
            }

            function draw(g, next) {
                // Draw HUD
                next(g);
            }

            function getAimPosition(t) {
                game.camera.screenToWorld(game.mouse, t);
            }

            function mousedown(button) {
                var t = new Vector(0,0);
                getAimPosition(t);
                if (button === 0) {
                    player.startPath(t.x,t.y);
                } else if (button === 2) {
                    player.fire(t.x,t.y);
                }
            }

            function mouseup(button) {
                if (button === 0) {
                    player.endPath();
                }
            }
            return me;
        }

        function editState() {
            var me = {
                enabled: false,
                enable: enable,
                disable: disable
            };

            function enable() {
            }

            function disable() {
            }
        }
        var player;

        function flatten(arr) {
            var r = [];
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].length !== undefined) {
                    r = r.concat(flatten(arr[i]));
                } else {
                    r.push(arr[i]);
                }
            }
            return r;
        }

        function rnd() {
            return (Math.random()-0.5) * 2;
        }


        g.changeState(gameplayState());
        game.objects.handlePending();
        g.start();
    }
});